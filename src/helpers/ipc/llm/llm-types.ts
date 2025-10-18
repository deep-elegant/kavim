import type { AiProvider } from '@/core/llm/aiModels';
import type { ChatMessage } from '@/core/llm/chatTypes';

export type LlmStreamRequestPayload = {
  requestId: string;
  provider: AiProvider;
  modelName: string;
  baseURL?: string;
  apiKey: string;
  messages: ChatMessage[];
};

export type LlmChunkPayload = {
  requestId: string;
  content: string;
};

export type LlmErrorPayload = {
  requestId: string;
  error: string;
};

export type LlmCompletePayload = {
  requestId: string;
};
