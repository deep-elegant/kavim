import { AI_MODELS, AI_PROVIDER_METADATA, type AiModel, type AiProvider } from '@/core/llm/aiModels';
import { ChatOpenAI } from '@langchain/openai';
import { type AIMessage, type AIMessageChunk } from '@langchain/core/messages';

export type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

type ProviderSettings = {
  envKey: () => string;
  placeholder: string;
  baseURL?: string;
};

type ModelSettings = ProviderSettings & {
  modelName: string;
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
    };

    return accumulator;
  },
  {} as Record<AiModel, ModelSettings>,
);

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

  const configuration = settings.baseURL ? { configuration: { baseURL: settings.baseURL } } : {};

  const llm = new ChatOpenAI({
    apiKey,
    model: settings.modelName,
    streaming: true,
    ...configuration,
  });

  const prompt = messages
    .map(({ role, content }) => `${role === 'user' ? 'User' : 'Assistant'}: ${content}`)
    .join('\n\n');

  const stream = await llm.stream(prompt);

  for await (const chunk of stream) {
    const content = extractMessageContent(chunk);
    onChunk(content);
  }
};
