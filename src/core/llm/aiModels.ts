export const AI_MODELS = [
  { value: 'deepseek', label: 'DeepSeek' },
  { value: 'chatgpt', label: 'ChatGPT' },
] as const;

export type AiModel = (typeof AI_MODELS)[number]['value'];
