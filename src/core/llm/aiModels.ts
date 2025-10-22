/**
 * Direct AI provider configurations (OpenAI, DeepSeek, Google, etc.).
 * - Each entry defines the provider's API endpoint and UI labels.
 * - Used to configure provider-specific API keys and generate dropdowns.
 */
export const AI_PROVIDER_METADATA = [
  {
    value: "openai",
    label: "OpenAI",
    inputPlaceholder: "Enter your OpenAI API key",
    apiKeyPlaceholder: "YOUR_OPENAI_API_KEY",
    baseURL: "https://api.openai.com/v1",
  },
  {
    value: "deepseek",
    label: "DeepSeek",
    inputPlaceholder: "Enter your DeepSeek API key",
    apiKeyPlaceholder: "YOUR_DEEPSEEK_API_KEY",
    baseURL: "https://api.deepseek.com/v1",
  },
  {
    value: "google",
    label: "Google",
    inputPlaceholder: "Enter your Google AI Studio API key",
    apiKeyPlaceholder: "YOUR_GOOGLE_API_KEY",
  },
  {
    value: "anthropic",
    label: "Anthropic",
    inputPlaceholder: "Enter your Anthropic API key",
    apiKeyPlaceholder: "YOUR_ANTHROPIC_API_KEY",
    baseURL: "https://api.anthropic.com/v1",
  },
  {
    value: "grok",
    label: "Grok",
    inputPlaceholder: "Enter your Grok API key",
    apiKeyPlaceholder: "YOUR_GROK_API_KEY",
    baseURL: "https://api.x.ai/v1",
  },
] as const;

export type AiProvider = (typeof AI_PROVIDER_METADATA)[number]["value"];

export type AiProviderMetadata = (typeof AI_PROVIDER_METADATA)[number];

/**
 * AI gateway configurations (e.g., OpenRouter).
 * - Gateways allow a single API key to access multiple models from different providers.
 * - Reduces need for individual provider API keys by routing through a gateway service.
 */
export const AI_GATEWAY_METADATA = [
  {
    value: "openrouter",
    label: "OpenRouter",
    description:
      "Use a single OpenRouter API key for any supported model. Optional headers help rank your app on openrouter.ai.",
    inputPlaceholder: "Enter your OpenRouter API key",
    apiKeyPlaceholder: "YOUR_OPENROUTER_API_KEY",
    baseURL: "https://openrouter.ai/api/v1",
    headerPlaceholders: {
      referer: "https://your-app-domain.com",
      title: "Your App Name",
    },
  },
] as const;

export type AiGateway = (typeof AI_GATEWAY_METADATA)[number]["value"];

export type AiGatewayMetadata = (typeof AI_GATEWAY_METADATA)[number];

type BaseAiModel = {
  value: string;
  label: string;
  provider: AiProvider;
  modelId: string;
  // Indicates if model requires verified organization account (e.g., for beta access)
  requiresOrganizationVerification?: boolean;
  // Alternative model IDs when accessed via gateway (e.g., OpenRouter uses different format)
  gatewayModelOverrides?: Partial<Record<AiGateway, string>>;
};

/**
 * Available AI models with their provider mappings.
 * - Each model specifies its native provider and model ID.
 * - Gateway overrides allow routing through services like OpenRouter with different identifiers.
 */
export const AI_MODELS = [
  {
    value: "deepseek",
    label: "DeepSeek: DeepSeek Chat",
    provider: "deepseek",
    modelId: "deepseek-chat",
    gatewayModelOverrides: {
      openrouter: "deepseek/deepseek-chat",
    },
  },
  {
    value: "chatgpt",
    label: "OpenAI: GPT-4o mini",
    provider: "openai",
    modelId: "gpt-4o-mini",
    gatewayModelOverrides: {
      openrouter: "openai/gpt-4o-mini",
    },
  },
  {
    value: "gpt-5-mini",
    label: "OpenAI: GPT-5 Mini",
    provider: "openai",
    modelId: "gpt-5-mini-2025-08-07",
    requiresOrganizationVerification: true,
    gatewayModelOverrides: {
      openrouter: "openai/gpt-5-mini-2025-08-07",
    },
  },
  {
    value: "gpt-5",
    label: "OpenAI: GPT-5",
    provider: "openai",
    modelId: "gpt-5-2025-08-07",
    requiresOrganizationVerification: true,
    gatewayModelOverrides: {
      openrouter: "openai/gpt-5-2025-08-07",
    },
  },
  {
    value: "gpt-5-pro",
    label: "OpenAI: GPT-5 Pro",
    provider: "openai",
    modelId: "gpt-5-pro-2025-10-06",
    requiresOrganizationVerification: true,
    gatewayModelOverrides: {
      openrouter: "openai/gpt-5-pro-2025-10-06",
    },
  },
  {
    value: "gpt-5-chat-latest",
    label: "OpenAI: GPT-5 Chat",
    provider: "openai",
    modelId: "gpt-5-chat-latest",
    gatewayModelOverrides: {
      openrouter: "openai/gpt-5-chat-latest",
    },
  },
  {
    value: "gemini-2-5-flash",
    label: "Google: Gemini 2.5 Flash",
    provider: "google",
    modelId: "gemini-2.5-flash",
    gatewayModelOverrides: {
      openrouter: "google/gemini-2.5-flash",
    },
  },
  {
    value: "gemini-2-5-pro",
    label: "Google: Gemini 2.5 Pro",
    provider: "google",
    modelId: "gemini-2.5-pro",
    gatewayModelOverrides: {
      openrouter: "google/gemini-2.5-pro",
    },
  },
  {
    value: "claude-haiku-4-5",
    label: "Anthropic: Claude Haiku 4.5",
    provider: "anthropic",
    modelId: "anthropic/claude-haiku-4.5",
    gatewayModelOverrides: {
      openrouter: "anthropic/claude-haiku-4.5",
    },
  },
  {
    value: "claude-sonnet-4-5",
    label: "Anthropic: Claude Sonnet 4.5",
    provider: "anthropic",
    modelId: "anthropic/claude-sonnet-4.5",
    gatewayModelOverrides: {
      openrouter: "anthropic/claude-sonnet-4.5",
    },
  },
  {
    value: "grok-4",
    label: "Grok: Grok 4",
    provider: "grok",
    modelId: "grok-4",
    gatewayModelOverrides: {
      openrouter: "xai/grok-4",
    },
  },
] as const satisfies ReadonlyArray<BaseAiModel>;

export type AiModel = (typeof AI_MODELS)[number]["value"];
export type AiModelMetadata = (typeof AI_MODELS)[number];
