import { ipcMain } from 'electron';
import { ChatOpenAI } from '@langchain/openai';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import type { AIMessage, AIMessageChunk } from '@langchain/core/messages';
import {
  LLM_STREAM_CHANNEL,
  LLM_STREAM_CHUNK_CHANNEL,
  LLM_STREAM_COMPLETE_CHANNEL,
  LLM_STREAM_ERROR_CHANNEL,
} from './llm-channels';
import type { LlmStreamRequestPayload } from './llm-types';

const extractMessageContent = (message: AIMessage | AIMessageChunk): string => {
  const { content } = message;

  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (!item) {
          return '';
        }

        if (typeof item === 'string') {
          return item;
        }

        if ('text' in item && typeof item.text === 'string') {
          return item.text;
        }

        return '';
      })
      .join('');
  }

  return '';
};

const formatPrompt = (messages: LlmStreamRequestPayload['messages']): string =>
  messages
    .map(({ role, content }) => `${role === 'user' ? 'User' : 'Assistant'}: ${content}`)
    .join('\n\n');

const createChatClient = (payload: LlmStreamRequestPayload) => {
  const { provider, apiKey, modelName, baseURL } = payload;

  if (!apiKey) {
    throw new Error(`Missing API key for provider ${provider}`);
  }

  if (provider === 'google') {
    return new ChatGoogleGenerativeAI({
      apiKey,
      model: modelName,
      streaming: true,
      apiVersion: 'v1'
    });
  }

  const openAIConfiguration = baseURL ? { configuration: { baseURL } } : {};

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
        const llm = createChatClient(payload);
        const prompt = formatPrompt(payload.messages);
        const stream = await llm.stream(prompt);

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
