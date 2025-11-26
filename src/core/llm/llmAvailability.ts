import {
  AI_GATEWAY_METADATA,
  AI_MODELS,
  AI_PROVIDER_METADATA,
  type AiProvider,
} from "./aiModels";

export const LLM_PROVIDER_KEYS_UPDATED_EVENT =
  "llm-settings:provider-keys-updated";

type ModelAvailability = {
  model: (typeof AI_MODELS)[number];
  isEnabled: boolean;
};

/** Collects providers with configured API keys (runtime access through preload bridge). */
export const readEnabledProviders = (): Set<AiProvider> => {
  const providers = new Set<AiProvider>();

  if (typeof window === "undefined" || !window.settingsStore) {
    return providers;
  }

  for (const provider of AI_PROVIDER_METADATA) {
    const stored = window.settingsStore.getProvider(provider.value);

    if (provider.value === "openai-compatible") {
      const hasEndpoint = stored?.baseURL?.trim();
      const hasModel = stored?.model?.trim();

      if (hasEndpoint && hasModel) {
        providers.add(provider.value);
      }

      continue;
    }

    const storedKey = stored?.apiKey?.trim();

    if (storedKey) {
      providers.add(provider.value);
    }
  }

  return providers;
};

/** Determines whether a gateway is configured to proxy all model requests. */
export const isGatewayForcedForAllModels = (): boolean => {
  if (typeof window === "undefined" || !window.settingsStore) {
    return false;
  }

  return AI_GATEWAY_METADATA.some(({ value }) => {
    const gatewayConfig = window.settingsStore.getGateway(value);
    return Boolean(gatewayConfig?.apiKey?.trim() && gatewayConfig.useForAllModels);
  });
};

/** Returns availability metadata for each AI model, preserving declaration order. */
export const resolveModelAvailability = (): ModelAvailability[] => {
  const providersWithKeys = readEnabledProviders();
  const gatewayCoversAll = isGatewayForcedForAllModels();

  return AI_MODELS.map((model) => ({
    model,
    isEnabled:
      gatewayCoversAll ||
      providersWithKeys.has(model.provider) ||
      model.provider === "openai-compatible",
  }));
};
