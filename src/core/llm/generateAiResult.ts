import {
  AI_GATEWAY_METADATA,
  AI_MODELS,
  AI_PROVIDER_METADATA,
  type AiGateway,
  type AiModel,
  type AiProvider,
  type ModelCapabilities,
} from "@/core/llm/aiModels";
import type { ChatMessage } from "@/core/llm/chatTypes";
import type {
  LlmChunkContent,
  LlmChunkPayload,
  LlmCompletePayload,
  LlmErrorPayload,
  LlmModelCapabilities,
  LlmStreamRequestPayload,
} from "@/helpers/ipc/llm/llm-types";

export type { ChatMessage } from "@/core/llm/chatTypes";

type ProviderSettings = {
  // Retrieves API key from settings store at runtime (not hardcoded)
  envKey: () => string;
  placeholder: string;
  baseURL?: string;
};

type ModelSettings = ProviderSettings & {
  modelName: string;
  provider: AiProvider;
  gatewayModelOverrides?: Partial<Record<AiGateway, string>>;
  capabilities: ModelCapabilities;
};

type StreamProgressUpdate = {
  aggregatedText: string;
  newBlocks: LlmChunkContent[];
};

/** Build lookup map from provider value to its configuration */
const PROVIDER_SETTINGS: Record<AiProvider, ProviderSettings> =
  AI_PROVIDER_METADATA.reduce(
    (accumulator, provider) => {
      const { value, apiKeyPlaceholder, baseURL } = provider;

      accumulator[value] = {
        envKey: () => window.settingsStore.getProvider(value)?.apiKey ?? "",
        placeholder: apiKeyPlaceholder,
        baseURL,
      };

      return accumulator;
    },
    {} as Record<AiProvider, ProviderSettings>,
  );

/** Build lookup map from model value to its full configuration (merges provider + model info) */
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
      capabilities: {
        input: model.capabilities?.input ?? ["text"],
        output: model.capabilities?.output ?? ["text"],
      },
    };

    return accumulator;
  },
  {} as Record<AiModel, ModelSettings>,
);

/**
 * Constructs payload for streaming LLM requests.
 * - Includes both the gateway/provider used and the underlying provider for routing.
 * - Headers support gateway-specific metadata (e.g., OpenRouter's referer/title).
 */
const buildStreamPayload = ({
  provider,
  resolvedProvider,
  modelName,
  baseURL,
  apiKey,
  messages,
  requestId,
  headers,
  capabilities,
}: {
  provider: AiProvider | AiGateway;
  resolvedProvider: AiProvider;
  modelName: string;
  baseURL?: string;
  apiKey: string;
  messages: ChatMessage[];
  requestId: string;
  headers?: Record<string, string>;
  capabilities: LlmModelCapabilities;
}): LlmStreamRequestPayload => ({
  requestId,
  provider,
  resolvedProvider,
  modelName,
  baseURL,
  apiKey,
  messages,
  headers,
  capabilities,
});

/**
 * Type guard ensuring the Electron LLM bridge is exposed on window.
 * - Throws if preload script hasn't registered the `window.llm` API.
 * - Narrows window type for TypeScript to access bridge methods safely.
 */
const assertLlmBridgeAvailable = (): asserts window is Window & {
  llm: {
    stream: (payload: LlmStreamRequestPayload) => void;
    onChunk: (callback: (payload: LlmChunkPayload) => void) => () => void;
    onError: (callback: (payload: LlmErrorPayload) => void) => () => void;
    onComplete: (callback: (payload: LlmCompletePayload) => void) => () => void;
  };
} => {
  if (!window.llm) {
    throw new Error("LLM bridge is not available");
  }
};

/**
 * Streams AI responses via Electron's IPC bridge.
 * - Checks for gateway preference (single API key for all models via OpenRouter, etc.).
 * - Falls back to direct provider if no gateway configured.
 * - Streams chunks via callbacks to avoid blocking on large responses.
 */
export const generateAiResult = async ({
  model,
  messages,
  onUpdate,
  onProgress,
  minimumUpdateIntervalMs = 50,
}: {
  model: AiModel;
  messages: ChatMessage[];
  onUpdate: (chunk: string) => void;
  onProgress?: (update: StreamProgressUpdate) => void;
  minimumUpdateIntervalMs?: number;
}): Promise<void> => {
  const settings = MODEL_SETTINGS[model];

  if (!settings) {
    throw new Error(`Unknown AI model: ${model}`);
  }

  const apiKey = settings.envKey();
  const requestId = crypto.randomUUID();

  assertLlmBridgeAvailable();

  const storedPreprompt = window.settingsStore.getPreprompt();
  const trimmedPreprompt = storedPreprompt.trim();
  const messagesWithPreprompt =
    trimmedPreprompt.length > 0 &&
    !settings.capabilities.output.includes("image") // Add system prompt only for text only response
      ? ([
          {
            role: "system",
            content: [{ type: "text", text: trimmedPreprompt }],
          },
          ...messages,
        ] satisfies ChatMessage[])
      : messages;

  await new Promise<void>((resolve, reject) => {
    // Track event listeners to unsubscribe when stream completes/errors
    const cleanupCallbacks: Array<() => void> = [];
    let pendingTimeout: number | null = null;
    let aggregatedResponse = "";
    let lastEmittedValue = "";
    let lastEmitTime = 0;

    const clearPendingTimeout = () => {
      if (pendingTimeout !== null) {
        window.clearTimeout(pendingTimeout);
        pendingTimeout = null;
      }
    };

    const flushBuffer = (force = false) => {
      clearPendingTimeout();

      if (!force && aggregatedResponse === lastEmittedValue) {
        return;
      }

      lastEmittedValue = aggregatedResponse;
      lastEmitTime = performance.now();
      onUpdate(aggregatedResponse);
    };

    const cleanup = () => {
      while (cleanupCallbacks.length > 0) {
        const unsubscribe = cleanupCallbacks.pop();
        unsubscribe?.();
      }
      clearPendingTimeout();
    };

    cleanupCallbacks.push(clearPendingTimeout);

    // Match requestId to prevent cross-request contamination (multiple parallel streams)
    const handleChunk = (payload: LlmChunkPayload) => {
      if (payload.requestId !== requestId) {
        return;
      }

      if (payload.type === "text") {
        aggregatedResponse += payload.delta;

        onProgress?.({
          aggregatedText: aggregatedResponse,
          newBlocks: [
            {
              type: "text",
              delta: payload.delta,
            },
          ],
        });

        if (payload.delta.length === 0) {
          return;
        }

        const now = performance.now();
        if (now - lastEmitTime >= minimumUpdateIntervalMs) {
          flushBuffer();
          return;
        }

        clearPendingTimeout();

        const delay = Math.max(0, minimumUpdateIntervalMs - (now - lastEmitTime));
        pendingTimeout = window.setTimeout(() => {
          pendingTimeout = null;
          flushBuffer();
        }, delay);

        return;
      }

      if (payload.type === "image-placeholder") {
        onProgress?.({
          aggregatedText: aggregatedResponse,
          newBlocks: [
            {
              type: "image-placeholder",
              asset: payload.asset,
            },
          ],
        });
        return;
      }

      if (payload.type === "image") {
        onProgress?.({
          aggregatedText: aggregatedResponse,
          newBlocks: [
            {
              type: "image",
              asset: payload.asset,
              ...(payload.alt ? { alt: payload.alt } : {}),
            },
          ],
        });
      }
    };

    const handleError = (payload: LlmErrorPayload) => {
      if (payload.requestId !== requestId) {
        return;
      }

      flushBuffer(true);
      cleanup();
      reject(new Error(payload.error));
    };

    const handleComplete = (payload: LlmCompletePayload) => {
      if (payload.requestId !== requestId) {
        return;
      }

      flushBuffer(true);
      cleanup();
      resolve();
    };

    cleanupCallbacks.push(window.llm.onChunk(handleChunk));
    cleanupCallbacks.push(window.llm.onError(handleError));
    cleanupCallbacks.push(window.llm.onComplete(handleComplete));

    try {
      // Check if user enabled a gateway (OpenRouter, etc.) for all models
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

        // Collect optional gateway headers (OpenRouter's app ranking metadata)
        const headerMap: Record<string, string> = {};

        if (stored.headers?.referer) {
          headerMap["HTTP-Referer"] = stored.headers.referer;
        }

        if (stored.headers?.title) {
          headerMap["X-Title"] = stored.headers.title;
        }

        gatewayPreference = {
          gateway,
          stored,
          headers: Object.keys(headerMap).length > 0 ? headerMap : undefined,
        };
        break;
      }

      // Use gateway if configured, otherwise direct provider
      const effectiveProvider =
        gatewayPreference?.gateway.value ?? settings.provider;
      const effectiveModelName = gatewayPreference?.gateway.value
        ? (settings.gatewayModelOverrides?.[gatewayPreference.gateway.value] ??
          settings.modelName)
        : settings.modelName;
      const effectiveBaseURL =
        gatewayPreference?.gateway.baseURL ?? settings.baseURL;
      const effectiveApiKey = gatewayPreference?.stored.apiKey ?? apiKey;
      const headers = gatewayPreference?.headers;

      const payload = buildStreamPayload({
        provider: effectiveProvider,
        resolvedProvider: settings.provider,
        modelName: effectiveModelName,
        baseURL: effectiveBaseURL,
        apiKey: effectiveApiKey,
        messages: messagesWithPreprompt,
        requestId,
        headers,
        capabilities: settings.capabilities,
      });
      window.llm.stream(payload);
    } catch (error) {
      cleanup();
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
};
