export type ProviderId = "openai" | "anthropic" | "google" | "groq" | "openrouter" | "huggingface" | "mistral";

export interface Connection {
  id: string;
  provider: ProviderId;
  providerName: string;
  keyHint: string;
  models: string[];
  addedAt: string;
}

export interface ConnectionsResponse {
  connections: Connection[];
  activeId: string | null;
}

export interface ValidationResult {
  validationId: string;
  provider: ProviderId;
  providerName: string;
  models: string[];
  chatModels: string[];
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  model?: string;
}

export interface ChatConversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  connectionId: string | null;
  model: string;
  createdAt: string;
  updatedAt: string;
}
