import { type AiModel } from '@/core/llm/aiModels';
import { ChatOpenAI } from '@langchain/openai';
import { type AIMessage, type AIMessageChunk } from '@langchain/core/messages';

export type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

const MODEL_SETTINGS: Record<
  AiModel,
  { envKey: () => string; placeholder: string; modelName: string; baseURL?: string }
> = {
  chatgpt: {
    envKey: () => window.settingsStore.get('chatgpt')?.apiKey ?? '',
    placeholder: 'YOUR_OPENAI_API_KEY',
    modelName: 'gpt-4o-mini',
  },
  deepseek: {
    envKey: () => window.settingsStore.get('deepseek')?.apiKey ?? '',
    placeholder: 'YOUR_DEEPSEEK_API_KEY',
    modelName: 'deepseek-chat',
    baseURL: 'https://api.deepseek.com/v1',
  },
};

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
  const apiKey = settings.envKey();

  const configuration = settings.baseURL ? { configuration: { baseURL: settings.baseURL } } : {};

  const llm = new ChatOpenAI({
    apiKey,
    model: settings.modelName,
    temperature: 0.2,
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
