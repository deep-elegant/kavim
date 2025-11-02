/**
 * Standard chat message format for LLM conversations.
 * - Follows OpenAI's message structure (role + content).
 * - Compatible with most LLM APIs for conversation history.
 */
export type ChatMessageTextPart = {
  type: "text";
  text: string;
};

export type ChatMessageImagePart = {
  type: "image";
  assetPath: string;
  alt?: string;
};

export type ChatMessagePart =
  | ChatMessageTextPart
  | ChatMessageImagePart;

export type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: ChatMessagePart[];
};
