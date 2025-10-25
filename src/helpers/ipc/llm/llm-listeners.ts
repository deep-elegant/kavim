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
          const { contents, systemInstruction } = buildGeminiRequest(messages);
          const response = await genAI.models.generateContentStream({
            model: modelName,
            contents,
            ...(systemInstruction ? { systemInstruction } : {}),
          });

          for await (const chunk of response) {
            const chunkText = chunk.text;

            if (!chunkText) {
              continue;
            }

            event.sender.send(LLM_STREAM_CHUNK_CHANNEL, {
              requestId: payload.requestId,
              content: chunkText,
            });
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
              content,
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
              content,
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
              content,
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
