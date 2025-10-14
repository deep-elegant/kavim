import { type AiModel } from '@/core/llm/aiModels';
import { ChatOpenAI } from '@langchain/openai';
import { AIMessage } from '@langchain/core/messages';

const MODEL_SETTINGS: Record<AiModel, { envKey: () => string; placeholder: string; modelName: string; baseURL?: string }> = {
  chatgpt: {
    envKey: () => window.settingsStore.get("chatgpt")?.apiKey ?? "",
    placeholder: 'YOUR_OPENAI_API_KEY',
    modelName: 'gpt-4o-mini',
  },
  deepseek: {
    envKey: () => window.settingsStore.get("deepseek")?.apiKey ?? "",
    placeholder: 'YOUR_DEEPSEEK_API_KEY',
    modelName: 'deepseek-chat',
    baseURL: 'https://api.deepseek.com/v1',
  },
};

const extractMessageContent = (message: AIMessage): string => {
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

export const generateAiResult = async ({ model, prompt }: { model: AiModel; prompt: string }): Promise<string> => {
  const settings = MODEL_SETTINGS[model];
  const apiKey = settings.envKey();

  const configuration = settings.baseURL ? { configuration: { baseURL: settings.baseURL } } : {};

  const llm = new ChatOpenAI({
    apiKey,
    model: settings.modelName,
    temperature: 0.2,
    ...configuration,
  });

  const response = await llm.invoke(prompt);
  const content = extractMessageContent(response);

  return content.trim();
};
