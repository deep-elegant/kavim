import { Buffer } from "buffer";
import { ipcMain } from "electron";
import { ChatOpenAI } from "@langchain/openai";
import { GoogleGenAI } from "@google/genai";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatXAI } from "@langchain/xai";
import {
  AIMessage,
  AIMessageChunk,
  HumanMessage,
  SystemMessage,
} from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import {
  LLM_STREAM_CHANNEL,
  LLM_STREAM_CHUNK_CHANNEL,
  LLM_STREAM_COMPLETE_CHANNEL,
  LLM_STREAM_ERROR_CHANNEL,
} from "./llm-channels";
import type { LlmStreamRequestPayload } from "./llm-types";
import { ensureActivePak, upsertPakAsset } from "@/core/pak/pak-manager";
import {
  buildPakUri,
  ensureAssetFileMetadata,
  reserveAssetPath,
} from "@/core/pak/assetPaths";

type GeminiInlineData = {
  mimeType?: string;
  data?: string;
};

type GeminiInlineDataPart = {
  inlineData: GeminiInlineData;
  altText?: string;
  text?: string;
};

type GeminiCandidate = {
  content?: {
    parts?: unknown[];
  };
};

const isGeminiInlineDataPart = (value: unknown): value is GeminiInlineDataPart => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const inlineData = (value as { inlineData?: GeminiInlineData }).inlineData;

  return (
    !!inlineData &&
    typeof inlineData === "object" &&
    typeof inlineData.data === "string" &&
    inlineData.data.length > 0
  );
};

const extractGeminiInlineImages = (chunk: unknown): GeminiInlineDataPart[] => {
  if (!chunk || typeof chunk !== "object") {
    return [];
  }

  const candidates = (chunk as { candidates?: unknown[] }).candidates;

  if (!Array.isArray(candidates)) {
    return [];
  }

  const inlineParts: GeminiInlineDataPart[] = [];

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") {
      continue;
    }

    const content = (candidate as GeminiCandidate).content;
    const parts = content?.parts;

    if (!Array.isArray(parts)) {
      continue;
    }

    for (const part of parts) {
      if (isGeminiInlineDataPart(part)) {
        inlineParts.push(part);
      }
    }
  }

  return inlineParts;
};

const extractMessageContent = (message: AIMessage | AIMessageChunk): string => {
  const { content } = message;

  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (!item) {
          return "";
        }

        if (typeof item === "string") {
          return item;
        }

        if ("text" in item && typeof item.text === "string") {
          return item.text;
        }

        return "";
      })
      .join("");
  }

  return "";
};

const mapMessagesToLangChain = (
  messages: LlmStreamRequestPayload["messages"],
): BaseMessage[] =>
  messages.map((message) => {
    switch (message.role) {
      case "user":
        return new HumanMessage({ content: message.content });
      case "assistant":
        return new AIMessage({ content: message.content });
      case "system":
        return new SystemMessage({ content: message.content });
      default:
        return new HumanMessage({ content: message.content });
    }
  });

type GeminiTextPart = { text: string };
type GeminiContent = {
  role?: "user" | "model" | "system";
  parts: GeminiTextPart[];
};

const buildGeminiRequest = (
  messages: LlmStreamRequestPayload["messages"],
) => {
  const contents: GeminiContent[] = [];
  const systemParts: GeminiTextPart[] = [];

  messages.forEach((message) => {
    if (message.role === "system") {
      if (message.content.trim()) {
        systemParts.push({ text: message.content });
      }
      return;
    }

    contents.push({
      role: message.role === "user" ? "user" : "model",
      parts: [{ text: message.content }],
    });
  });

  const systemInstruction =
    systemParts.length > 0
      ? ({ role: "system", parts: systemParts } satisfies GeminiContent)
      : undefined;

  return { contents, systemInstruction };
};

const buildGeminiImagePrompt = (
  messages: LlmStreamRequestPayload["messages"],
) => {
  const systemSegments: string[] = [];
  const userSegments: string[] = [];
  let lastUserPrompt: string | undefined;

  for (const message of messages) {
    const trimmed = message.content.trim();

    if (!trimmed) {
      continue;
    }

    if (message.role === "system") {
      systemSegments.push(trimmed);
      continue;
    }

    if (message.role === "user") {
      userSegments.push(trimmed);
      lastUserPrompt = trimmed;
    }
  }

  if (userSegments.length === 0) {
    throw new Error("Image generation requires at least one user prompt");
  }

  return {
    prompt: [...systemSegments, ...userSegments].join("\n\n"),
    lastUserPrompt,
  };
};

const createOpenAiChatClient = (payload: LlmStreamRequestPayload) => {
  const { provider, apiKey, modelName, baseURL, headers } = payload;

  if (!apiKey) {
    throw new Error(`Missing API key for provider ${provider}`);
  }

  const configuration: {
    baseURL?: string;
    defaultHeaders?: Record<string, string>;
  } = {};

  if (baseURL) {
    configuration.baseURL = baseURL;
  }

  if (headers) {
    configuration.defaultHeaders = headers;
  }

  const openAIConfiguration =
    configuration.baseURL || configuration.defaultHeaders
      ? { configuration }
      : {};

  return new ChatOpenAI({
    apiKey,
    model: modelName,
    streaming: true,
    ...openAIConfiguration,
  });
};

export const addLlmEventListeners = () => {
  ipcMain.on(LLM_STREAM_CHANNEL, (event, payload: LlmStreamRequestPayload) => {
    void (async () => {
      try {
        const { provider, apiKey, baseURL, modelName, messages } = payload;

        if (!apiKey) {
          throw new Error(`Missing API key for provider ${provider}`);
        }

        if (provider === "google") {
          if (baseURL) {
            throw new Error(
              "Custom base URLs are not supported for Google Gemini",
            );
          }

          const genAI = new GoogleGenAI({ apiKey });
          const pak = ensureActivePak();
          const usedPaths = new Set(Object.keys(pak.files));
          const persistImageChunk = (
            base64Data: string,
            mimeType?: string,
            alt?: string,
          ) => {
            const trimmedAlt = alt?.trim() || undefined;
            const extensionHint = mimeType?.split("/")?.[1];
            const { assetFileName, displayFileName } = ensureAssetFileMetadata(
              trimmedAlt,
              extensionHint,
            );
            const assetPath = reserveAssetPath(usedPaths, assetFileName);

            upsertPakAsset({
              path: assetPath,
              data: Buffer.from(base64Data, "base64"),
            });

            return {
              asset: {
                path: assetPath,
                uri: buildPakUri(assetPath),
                fileName: displayFileName,
              },
              alt: trimmedAlt,
            } as const;
          };

          if (payload.capabilities.output === "image") {
            const { prompt, lastUserPrompt } = buildGeminiImagePrompt(messages);
            const response = await genAI.models.generateImages({
              model: modelName,
              prompt,
            });

            const generatedImages = response.generatedImages ?? [];

            for (const generatedImage of generatedImages) {
              const image = generatedImage.image;
              const imageBytes = image?.imageBytes;

              if (!imageBytes) {
                continue;
              }

              const altCandidate =
                generatedImage.enhancedPrompt?.trim() || lastUserPrompt;

              const { asset, alt } = persistImageChunk(
                imageBytes,
                image?.mimeType,
                altCandidate,
              );

              event.sender.send(LLM_STREAM_CHUNK_CHANNEL, {
                requestId: payload.requestId,
                type: "image",
                asset,
                ...(alt ? { alt } : {}),
              });
            }
          } else {
            const { contents, systemInstruction } =
              buildGeminiRequest(messages);
            const response = await genAI.models.generateContentStream({
              model: modelName,
              contents,
              ...(systemInstruction ? { systemInstruction } : {}),
            });

            const supportsImageOutput =
              payload.capabilities.output === "text+image";
            const emittedImages = new Set<string>();

            for await (const chunk of response) {
              const chunkText = chunk.text;

              if (chunkText) {
                event.sender.send(LLM_STREAM_CHUNK_CHANNEL, {
                  requestId: payload.requestId,
                  type: "text",
                  delta: chunkText,
                });
              }

              if (!supportsImageOutput) {
                continue;
              }

              const imageParts = extractGeminiInlineImages(chunk);

              for (const part of imageParts) {
                const inlineData = part.inlineData;
                const signature = inlineData.data;

                if (!signature || emittedImages.has(signature)) {
                  continue;
                }

                emittedImages.add(signature);

                const alt = part.altText ?? part.text;
                const { asset, alt: resolvedAlt } = persistImageChunk(
                  inlineData.data,
                  inlineData.mimeType,
                  alt,
                );

                event.sender.send(LLM_STREAM_CHUNK_CHANNEL, {
                  requestId: payload.requestId,
                  type: "image",
                  asset,
                  ...(resolvedAlt ? { alt: resolvedAlt } : {}),
                });
              }
            }

            await response;
          }
        } else if (provider === "anthropic") {
          const llm = new ChatAnthropic({
            apiKey,
            model: modelName,
            streaming: true,
          });
          const stream = await llm.stream(mapMessagesToLangChain(messages));

          for await (const chunk of stream) {
            const content = extractMessageContent(chunk);
            if (!content) {
              continue;
            }

            event.sender.send(LLM_STREAM_CHUNK_CHANNEL, {
              requestId: payload.requestId,
              type: "text",
              delta: content,
            });
          }
        } else if (provider === "grok") {
          const xaiConfiguration = baseURL ? { baseURL } : {};
          const llm = new ChatXAI({
            apiKey,
            model: modelName,
            streaming: true,
            ...xaiConfiguration,
          });
          const stream = await llm.stream(mapMessagesToLangChain(messages));

          for await (const chunk of stream) {
            const content = extractMessageContent(chunk);
            if (!content) {
              continue;
            }

            event.sender.send(LLM_STREAM_CHUNK_CHANNEL, {
              requestId: payload.requestId,
              type: "text",
              delta: content,
            });
          }
        } else if (
          provider === "openai" ||
          provider === "deepseek" ||
          provider === "openrouter"
        ) {
          const llm = createOpenAiChatClient(payload);
          const stream = await llm.stream(mapMessagesToLangChain(messages));

          for await (const chunk of stream) {
            const content = extractMessageContent(chunk);
            if (!content) {
              continue;
            }

            event.sender.send(LLM_STREAM_CHUNK_CHANNEL, {
              requestId: payload.requestId,
              type: "text",
              delta: content,
            });
          }
        } else {
          throw new Error(`Unsupported provider ${provider}`);
        }

        event.sender.send(LLM_STREAM_COMPLETE_CHANNEL, {
          requestId: payload.requestId,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        event.sender.send(LLM_STREAM_ERROR_CHANNEL, {
          requestId: payload.requestId,
          error: message,
        });
      }
    })();
  });
};
