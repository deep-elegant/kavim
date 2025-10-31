import type { AiGateway, AiProvider } from "@/core/llm/aiModels";
import type { ChatMessage } from "@/core/llm/chatTypes";

export type LlmStreamRequestPayload = {
  requestId: string;
  provider: AiProvider | AiGateway;
  resolvedProvider: AiProvider;
  modelName: string;
  baseURL?: string;
  apiKey: string;
  messages: ChatMessage[];
  headers?: Record<string, string>;
  capabilities: LlmModelCapabilities;
};

export type LlmModelOutputCapability = "text" | "text+image" | "image";

export type LlmModelCapabilities = {
  output: LlmModelOutputCapability;
};

export type LlmImageAsset = {
  path: string;
  uri: string;
  fileName: string;
};

export type LlmChunkContent =
  | { type: "text"; delta: string }
  | { type: "image-placeholder"; asset: LlmImageAsset }
  | { type: "image"; asset: LlmImageAsset; alt?: string };

export type LlmChunkPayload = { requestId: string } & LlmChunkContent;

export type LlmErrorPayload = {
  requestId: string;
  error: string;
};

export type LlmCompletePayload = {
  requestId: string;
};
