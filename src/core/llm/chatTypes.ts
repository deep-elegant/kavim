/**
 * Standard chat message format for LLM conversations.
 * - Follows OpenAI's message structure (role + content).
 * - Compatible with most LLM APIs for conversation history.
 */
export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};
