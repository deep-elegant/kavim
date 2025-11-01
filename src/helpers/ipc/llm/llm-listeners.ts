import { Buffer } from "buffer";
import { ipcMain } from "electron";
import { ChatOpenAI } from "@langchain/openai";
import { ContentReferenceImage, GoogleGenAI } from "@google/genai";
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
import { PakAssetDataResult, getAssetData as resolvePakAssetData } from "@/helpers/ipc/pak/pak-listeners";
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

const assetDataToBase64 = (assetData: PakAssetDataResult): string => {
  return Buffer.from(assetData.data).toString("base64");
};

const mapMessagesToLangChain = (
  messages: LlmStreamRequestPayload["messages"],
): BaseMessage[] => {
  return messages.map((message) => {
    const structuredParts: (
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string } }
    )[] = [];
    let includesImage = false;
    const textSegments: string[] = [];

    for (const part of message.content) {
      if (part.type === "text") {
        structuredParts.push({ type: "text", text: part.text });
        textSegments.push(part.text);
        continue;
      }

      const asset = resolvePakAssetData(part.assetPath);
      if (!asset) {
        continue;
      }

      includesImage = true;
      structuredParts.push({
        type: "image_url",
        image_url: {
          url: `data:${asset.mimeType};base64,${assetDataToBase64(asset)}`,
        },
      });
    }

    let content:
      | string
      | Array<
          { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }
        >;

    if (includesImage) {
      const filtered = structuredParts.filter((part) => {
        if (part.type === "image_url") {
          return true;
        }

        return part.text.trim().length > 0;
      });

      content = filtered.length > 0 ? filtered : "";
    } else {
      const mergedText = textSegments.map((segment) => segment).join("\n\n");
      content = mergedText;
    }

    switch (message.role) {
      case "user":
        return new HumanMessage({ content });
      case "assistant":
        return new AIMessage({ content });
      case "system":
        return new SystemMessage({ content });
      default:
        return new HumanMessage({ content });
    }
  });
};

type GeminiTextPart = { text: string };
type GeminiInlinePart = { inlineData: GeminiInlineData; altText?: string };
type GeminiPart = GeminiTextPart | GeminiInlinePart;
type GeminiContent = {
  role?: "user" | "model" | "system";
  parts: GeminiPart[];
};

const buildGeminiRequest = (
  messages: LlmStreamRequestPayload["messages"],
) => {
  const contents: GeminiContent[] = [];
  const systemParts: GeminiTextPart[] = [];
  let lastUserPrompt: string | undefined;

  messages.forEach((message) => {
    if (message.role === "system") {
      message.content.forEach((part) => {
        if (part.type === "text" && part.text.trim()) {
          systemParts.push({ text: part.text });
        }
      });
      return;
    }

    const parts: GeminiPart[] = [];
    const textSegments: string[] = [];

    message.content.forEach((part) => {
      if (part.type === "text") {
        if (part.text.trim().length === 0) {
          return;
        }

        parts.push({ text: part.text });
        textSegments.push(part.text);
        return;
      }

      const asset = resolvePakAssetData(part.assetPath);
      if (!asset) {
        return;
      }

      parts.push({
        inlineData: { mimeType: asset.mimeType, data: assetDataToBase64(asset) },
        ...(part.alt ? { altText: part.alt } : {}),
      });
    });

    if (parts.length === 0) {
      return;
    }

    if (message.role === "user") {
      const currentPrompt = textSegments.join("\n\n");
      if (currentPrompt) {
        lastUserPrompt = currentPrompt;
      }
    }

    contents.push({
      role: message.role === "user" ? "user" : "model",
      parts,
    });
  });

  const systemInstruction =
    systemParts.length > 0
      ? ({ role: "system", parts: systemParts } satisfies GeminiContent)
      : undefined;

  return { contents, systemInstruction, lastUserPrompt };
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

          const genAI = new GoogleGenAI({
            apiKey,
          });
          const pak = ensureActivePak();
          const usedPaths = new Set(Object.keys(pak.files));
          const reserveImageAsset = (
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
            usedPaths.add(assetPath);
            const asset = {
              path: assetPath,
              uri: buildPakUri(assetPath),
              fileName: displayFileName,
            } as const;

            event.sender.send(LLM_STREAM_CHUNK_CHANNEL, {
              requestId: payload.requestId,
              type: "image-placeholder",
              asset,
            });

            return {
              asset,
              alt: trimmedAlt,
              persist: (base64Data: string) => {
                upsertPakAsset({
                  path: assetPath,
                  data: Buffer.from(base64Data, "base64"),
                });

                return {
                  asset,
                  alt: trimmedAlt,
                } as const;
              },
            } as const;
          };

          const outputCapabilities = payload.capabilities.output;
          const { contents, systemInstruction } = (
            buildGeminiRequest(messages)
          );
          const response = await genAI.models.generateContentStream({
            model: modelName,
            contents,
            ...(systemInstruction ? { systemInstruction } : {}),
          });

          const supportsImageOutput =
            outputCapabilities.includes("image") &&
            outputCapabilities.includes("text");
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
              const reservation = reserveImageAsset(
                inlineData.mimeType,
                alt,
              );
              const { asset, alt: resolvedAlt } = reservation.persist(
                inlineData.data!,
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
