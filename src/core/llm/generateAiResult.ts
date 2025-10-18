import {
  AI_MODELS,
  AI_PROVIDER_METADATA,
  type AiModel,
  type AiProvider,
} from '@/core/llm/aiModels';
import type { ChatMessage } from '@/core/llm/chatTypes';
import type {
  LlmChunkPayload,
  LlmCompletePayload,
  LlmErrorPayload,
  LlmStreamRequestPayload,
} from '@/helpers/ipc/llm/llm-types';

export type { ChatMessage } from '@/core/llm/chatTypes';

type ProviderSettings = {
  envKey: () => string;
  placeholder: string;
  baseURL?: string;
};

type ModelSettings = ProviderSettings & {
  modelName: string;
  provider: AiProvider;
};

const PROVIDER_SETTINGS: Record<AiProvider, ProviderSettings> = AI_PROVIDER_METADATA.reduce(
  (accumulator, provider) => {
    const { value, apiKeyPlaceholder, baseURL } = provider;

    accumulator[value] = {
      envKey: () => window.settingsStore.get(value)?.apiKey ?? '',
      placeholder: apiKeyPlaceholder,
      baseURL,
    };

    return accumulator;
  },
  {} as Record<AiProvider, ProviderSettings>,
);

const MODEL_SETTINGS: Record<AiModel, ModelSettings> = AI_MODELS.reduce(
  (accumulator, model) => {
    const providerSettings = PROVIDER_SETTINGS[model.provider];

    if (!providerSettings) {
      throw new Error(`Provider settings not found for model ${model.value}`);
    }

    accumulator[model.value] = {
      ...providerSettings,
      modelName: model.modelId,
      baseURL: model.baseURL ?? providerSettings.baseURL,
      provider: model.provider,
    };

    return accumulator;
  },
  {} as Record<AiModel, ModelSettings>,
);

const buildStreamPayload = (
  settings: ModelSettings,
  messages: ChatMessage[],
  apiKey: string,
  requestId: string,
): LlmStreamRequestPayload => ({
  requestId,
  provider: settings.provider,
  modelName: settings.modelName,
  baseURL: settings.baseURL,
  apiKey,
  messages,
});

const assertLlmBridgeAvailable = (): asserts window is Window & {
  llm: {
    stream: (payload: LlmStreamRequestPayload) => void;
    onChunk: (
      callback: (payload: LlmChunkPayload) => void,
    ) => () => void;
    onError: (
      callback: (payload: LlmErrorPayload) => void,
    ) => () => void;
    onComplete: (
      callback: (payload: LlmCompletePayload) => void,
    ) => () => void;
  };
} => {
  if (!window.llm) {
    throw new Error('LLM bridge is not available');
  }
};

export const generateAiResult = async ({
  model,
  messages,
  onChunk,
}: {
  model: AiModel;
  messages: ChatMessage[];
  onChunk: (chunk: string) => void;
}): Promise<void> => {
  const settings = MODEL_SETTINGS[model];

  if (!settings) {
    throw new Error(`Unknown AI model: ${model}`);
  }

  const apiKey = settings.envKey();
  const requestId = crypto.randomUUID();

  assertLlmBridgeAvailable();

  await new Promise<void>((resolve, reject) => {
    const cleanupCallbacks: Array<() => void> = [];

    const cleanup = () => {
      while (cleanupCallbacks.length > 0) {
        const unsubscribe = cleanupCallbacks.pop();
        unsubscribe?.();
      }
    };

    const handleChunk = (payload: LlmChunkPayload) => {
      if (payload.requestId !== requestId) {
        return;
      }

      onChunk(payload.content);
    };

    const handleError = (payload: LlmErrorPayload) => {
      if (payload.requestId !== requestId) {
        return;
      }

      cleanup();
      reject(new Error(payload.error));
    };

    const handleComplete = (payload: LlmCompletePayload) => {
      if (payload.requestId !== requestId) {
        return;
      }

      cleanup();
      resolve();
    };

    cleanupCallbacks.push(window.llm.onChunk(handleChunk));
    cleanupCallbacks.push(window.llm.onError(handleError));
    cleanupCallbacks.push(window.llm.onComplete(handleComplete));

    try {
      const payload = buildStreamPayload(settings, messages, apiKey, requestId);
      window.llm.stream(payload);
    } catch (error) {
      cleanup();
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
};
