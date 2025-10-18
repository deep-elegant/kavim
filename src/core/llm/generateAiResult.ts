import {
  AI_GATEWAY_METADATA,
  AI_MODELS,
  AI_PROVIDER_METADATA,
  type AiGateway,
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
  gatewayModelOverrides?: Partial<Record<AiGateway, string>>;
};

const PROVIDER_SETTINGS: Record<AiProvider, ProviderSettings> = AI_PROVIDER_METADATA.reduce(
  (accumulator, provider) => {
    const { value, apiKeyPlaceholder, baseURL } = provider;

    accumulator[value] = {
      envKey: () => window.settingsStore.getProvider(value)?.apiKey ?? '',
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
      gatewayModelOverrides: model.gatewayModelOverrides,
    };

    return accumulator;
  },
  {} as Record<AiModel, ModelSettings>,
);

const buildStreamPayload = ({
  provider,
  resolvedProvider,
  modelName,
  baseURL,
  apiKey,
  messages,
  requestId,
  headers,
}: {
  provider: AiProvider | AiGateway;
  resolvedProvider: AiProvider;
  modelName: string;
  baseURL?: string;
  apiKey: string;
  messages: ChatMessage[];
  requestId: string;
  headers?: Record<string, string>;
}): LlmStreamRequestPayload => ({
  requestId,
  provider,
  resolvedProvider,
  modelName,
  baseURL,
  apiKey,
  messages,
  headers,
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
      let gatewayPreference:
        | {
            gateway: (typeof AI_GATEWAY_METADATA)[number];
            stored: NonNullable<
              ReturnType<typeof window.settingsStore.getGateway>
            >;
            headers?: Record<string, string>;
          }
        | undefined;

      for (const gateway of AI_GATEWAY_METADATA) {
        const stored = window.settingsStore.getGateway(gateway.value);

        if (!stored?.useForAllModels || !stored.apiKey) {
          continue;
        }

        const headerMap: Record<string, string> = {};

        if (stored.headers?.referer) {
          headerMap['HTTP-Referer'] = stored.headers.referer;
        }

        if (stored.headers?.title) {
          headerMap['X-Title'] = stored.headers.title;
        }

        gatewayPreference = {
          gateway,
          stored,
          headers: Object.keys(headerMap).length > 0 ? headerMap : undefined,
        };
        break;
      }

      const effectiveProvider = gatewayPreference?.gateway.value ?? settings.provider;
      const effectiveModelName = gatewayPreference?.gateway.value
        ? settings.gatewayModelOverrides?.[gatewayPreference.gateway.value] ?? settings.modelName
        : settings.modelName;
      const effectiveBaseURL = gatewayPreference?.gateway.baseURL ?? settings.baseURL;
      const effectiveApiKey = gatewayPreference?.stored.apiKey ?? apiKey;
      const headers = gatewayPreference?.headers;

      const payload = buildStreamPayload({
        provider: effectiveProvider,
        resolvedProvider: settings.provider,
        modelName: effectiveModelName,
        baseURL: effectiveBaseURL,
        apiKey: effectiveApiKey,
        messages,
        requestId,
        headers,
      });
      window.llm.stream(payload);
    } catch (error) {
      cleanup();
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
};
