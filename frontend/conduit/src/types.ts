export type ProviderId = "openai" | "anthropic" | "google" | "groq" | "openrouter" | "huggingface" | "mistral";

export interface Connection {
  id: string;
  provider: ProviderId;
  providerName: string;
  keyHint: string;
  models: string[];
  addedAt: string;
  status?: "valid" | "invalid" | "rate-limited";
  lastValidatedAt?: string;
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
  role: "system" | "user" | "assistant";
  content: string;
  model?: string;
}

export interface ChatGenerationOptions {
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface TokenUsage {
  input?: number;
  output?: number;
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
