import type { ChatMessage, ProviderId } from "../src/types";

export interface ModelRecord {
  id: string;
  chat: boolean;
}

export interface Provider {
  id: ProviderId;
  name: string;
  baseUrl: string;
  matchesKey: (key: string) => boolean;
  listModels: (key: string, signal: AbortSignal) => Promise<ModelRecord[]>;
  chat: (
    key: string,
    model: string,
    messages: ChatMessage[],
    signal: AbortSignal,
  ) => Promise<Response>;
  extractDelta: (event: unknown) => string;
  extractModel: (event: unknown) => string | undefined;
}

export class ProviderRequestError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ProviderRequestError";
  }
}

export function isCredentialRejection(error: unknown): error is ProviderRequestError {
  if (!(error instanceof ProviderRequestError)) return false;
  if (error.status === 401) return true;
  if (error.status !== 400 && error.status !== 403) return false;
  return /\b(?:api[\s_-]?key|token|credential)\b.{0,100}\b(?:invalid|not\s+valid|rejected|incorrect|unauthorized)\b|\b(?:invalid|not\s+valid|rejected|incorrect|unauthorized)\b.{0,100}\b(?:api[\s_-]?key|token|credential)\b/i.test(
    error.message,
  );
}

export async function providerResponseError(response: Response): Promise<ProviderRequestError> {
  let detail: string | undefined;
  try {
    const body = (await response.json()) as
      | { error?: { message?: unknown } | string; message?: unknown }
      | null;
    const error = body?.error;
    const message = typeof error === "object" && error !== null ? error.message : error;
    if (typeof message === "string") detail = message;
    else if (typeof body?.message === "string") detail = body.message;
  } catch {
    // Some providers return a non-JSON error body; retain the status-based message.
  }
  return new ProviderRequestError(
    detail?.trim().slice(0, 400) || `Provider request failed (${response.status})`,
    response.status,
  );
}

export function providerStreamError(event: unknown): ProviderRequestError | undefined {
  if (!event || typeof event !== "object") return undefined;
  const value = event as { error?: unknown; message?: unknown; status?: unknown };
  const nested = value.error;
  const nestedMessage =
    typeof nested === "string"
      ? nested
      : nested && typeof nested === "object" && "message" in nested && typeof nested.message === "string"
        ? nested.message
        : undefined;
  const message = nestedMessage ?? (typeof value.message === "string" ? value.message : undefined);
  if (!message) return undefined;
  const status = typeof value.status === "number" && Number.isInteger(value.status) ? value.status : 502;
  return new ProviderRequestError(message.slice(0, 400), status);
}

async function providerJson(response: Response): Promise<unknown> {
  if (!response.ok) {
    throw await providerResponseError(response);
  }
  return response.json() as Promise<unknown>;
}

function records(data: unknown): Array<Record<string, unknown>> {
  if (!data || typeof data !== "object") return [];
  const object = data as { data?: unknown; models?: unknown };
  const list = Array.isArray(object.data) ? object.data : Array.isArray(object.models) ? object.models : [];
  return list.filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === "object");
}

function modelIsChat(id: string, metadata: Record<string, unknown>): boolean {
  const name = id.toLowerCase();
  if (/embed|whisper|tts|speech|image|banana|dall-e|imagen|veo|moderation|transcri|audio|robotics|computer-use|lyria|deep-research|realtime|live|search-api|codex|gpt-3\.5-turbo-instruct/.test(name)) {
    return false;
  }
  const methods = metadata.supportedGenerationMethods;
  if (Array.isArray(methods)) {
    return methods.includes("generateContent") || methods.includes("streamGenerateContent");
  }
  if (["chat-completion", "conversational", "text-generation", "image-text-to-text"].includes(String(metadata.pipeline_tag ?? metadata.task ?? ""))) {
    return true;
  }
  if (metadata.type === "embedding" || metadata.type === "image") return false;
  return /gpt|chat|claude|gemini|llama|mixtral|deepseek|command|qwen|mistral|phi|kimi|glm|gemma|solar|jamba|aya|internlm|yi-|rwkv|instruct|o[1-4](?:-|$)/.test(name);
}

function openAiModels(data: unknown): ModelRecord[] {
  return records(data)
    .map((entry) => ({ entry, id: String(entry.id ?? "") }))
    .filter(({ id }) => Boolean(id))
    .map(({ entry, id }) => ({ id, chat: modelIsChat(id, entry) }));
}

function messagesPayload(messages: ChatMessage[]) {
  return messages
    .filter((message) => message.content.trim().length > 0)
    .map(({ role, content }) => ({ role, content }));
}

const openAiCompatible = (
  id: ProviderId,
  name: string,
  baseUrl: string,
  matchesKey: (key: string) => boolean,
): Provider => ({
  id,
  name,
  baseUrl,
  matchesKey,
  async listModels(key, signal) {
    const response = await fetch(`${baseUrl}/models`, {
      headers: { Authorization: `Bearer ${key}` },
      signal,
    });
    return openAiModels(await providerJson(response));
  },
  chat(key, model, messages, signal) {
    return fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages: messagesPayload(messages), stream: true }),
      signal,
    });
  },
  extractDelta(event) {
    if (!event || typeof event !== "object") return "";
    const choices = (event as { choices?: Array<{ delta?: { content?: unknown } }> }).choices;
    const content = choices?.[0]?.delta?.content;
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      return content
        .filter((part): part is { text: string } => !!part && typeof part === "object" && typeof part.text === "string")
        .map((part) => part.text)
        .join("");
    }
    return "";
  },
  extractModel(event) {
    const model = (event as { model?: unknown } | null)?.model;
    return typeof model === "string" ? model : undefined;
  },
});

const providers: Provider[] = [
  openAiCompatible("openai", "OpenAI", "https://api.openai.com/v1", (key) => key.startsWith("sk-")),
  {
    id: "anthropic",
    name: "Anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    matchesKey: (key) => key.startsWith("sk-ant-"),
    async listModels(key, signal) {
      const response = await fetch("https://api.anthropic.com/v1/models", {
        headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
        signal,
      });
      return openAiModels(await providerJson(response));
    },
    chat(key, model, messages, signal) {
      const chatMessages = messagesPayload(messages);
      return fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          max_tokens: 2048,
          messages: chatMessages,
          stream: true,
        }),
        signal,
      });
    },
    extractDelta(event) {
      const value = event as { type?: string; delta?: { text?: unknown } } | null;
      return value?.type === "content_block_delta" && typeof value.delta?.text === "string" ? value.delta.text : "";
    },
    extractModel(event) {
      const value = event as { type?: string; message?: { model?: unknown } } | null;
      return value?.type === "message_start" && typeof value.message?.model === "string"
        ? value.message.model
        : undefined;
    },
  },
  {
    id: "google",
    name: "Google Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    matchesKey: (key) => key.startsWith("AIza"),
    async listModels(key, signal) {
      const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models", {
        headers: { "x-goog-api-key": key },
        signal,
      });
      return records(await providerJson(response))
        .map((entry) => {
          const rawName = String(entry.name ?? "");
          const id = rawName.replace(/^models\//, "");
          return { id, chat: Boolean(id) && modelIsChat(id, entry) };
        })
        .filter((model) => model.id);
    },
    chat(key, model, messages, signal) {
      const contents = messagesPayload(messages).map((message) => ({
        role: message.role === "assistant" ? "model" : "user",
        parts: [{ text: message.content }],
      }));
      return fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`,
        {
          method: "POST",
          headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
          body: JSON.stringify({ contents }),
          signal,
        },
      );
    },
    extractDelta(event) {
      const candidates = (event as { candidates?: Array<{ content?: { parts?: Array<{ text?: unknown }> } }> } | null)
        ?.candidates;
      return (candidates?.[0]?.content?.parts ?? [])
        .map((part) => (typeof part.text === "string" ? part.text : ""))
        .join("");
    },
    extractModel(event) {
      const value = (event as { modelVersion?: unknown } | null)?.modelVersion;
      return typeof value === "string" ? value : undefined;
    },
  },
  openAiCompatible("groq", "Groq", "https://api.groq.com/openai/v1", (key) => key.startsWith("gsk_")),
  openAiCompatible("openrouter", "OpenRouter", "https://openrouter.ai/api/v1", (key) => key.startsWith("sk-or-")),
  openAiCompatible("huggingface", "Hugging Face", "https://router.huggingface.co/v1", (key) => key.startsWith("hf_")),
  openAiCompatible("mistral", "Mistral AI", "https://api.mistral.ai/v1", () => false),
];

export function getProviderHint(key: string): Provider | undefined {
  if (key.startsWith("sk-ant-")) return providers.find((provider) => provider.id === "anthropic");
  if (key.startsWith("sk-or-")) return providers.find((provider) => provider.id === "openrouter");
  if (key.startsWith("hf_")) return providers.find((provider) => provider.id === "huggingface");
  if (key.startsWith("gsk_")) return providers.find((provider) => provider.id === "groq");
  if (key.startsWith("AIza")) return providers.find((provider) => provider.id === "google");
  if (key.startsWith("sk-")) return providers.find((provider) => provider.id === "openai");
  return undefined;
}

export function getProviders(): Provider[] {
  const probeOrder: ProviderId[] = ["anthropic", "openai", "google", "groq", "openrouter", "huggingface", "mistral"];
  return [...providers].sort((first, second) => probeOrder.indexOf(first.id) - probeOrder.indexOf(second.id));
}

export function findProvider(id: ProviderId): Provider | undefined {
  return providers.find((provider) => provider.id === id);
}

export function getChatModels(models: ModelRecord[]): string[] {
  return models.filter((model) => model.chat).map((model) => model.id);
}

export function filterChatModels(models: string[]): string[] {
  return models.filter((model) => modelIsChat(model, {}));
}

export function providerFailureMessage(error: unknown): string {
  if (!(error instanceof ProviderRequestError)) {
    return "Provider request failed.";
  }
  let summary: string;
  if (error.status === 401) summary = "The provider did not accept this key. Check that it was copied correctly, is still active, and has API access.";
  else if (error.status === 403) summary = "The key was recognized, but it does not have permission for this request.";
  else if (error.status === 404) summary = "The provider endpoint or requested model was not found.";
  else if (error.status === 429) summary = "The provider rate limit was reached. Try again later.";
  else if (error.status && error.status >= 500) summary = "The provider is currently unavailable.";
  else summary = "The provider request could not be completed.";

  const detail = error.message
    .trim()
    .replace(/\b(?:sk-[A-Za-z0-9_-]{8,}|gsk_[A-Za-z0-9_-]{8,}|hf_[A-Za-z0-9_-]{8,}|AIza[A-Za-z0-9_-]{20,})\b/g, "[REDACTED]");
  return detail && !detail.startsWith("Provider request failed (")
    ? `${summary} Provider details: ${detail}`
    : summary;
}

export function redactApiKey(message: string, apiKey: string): string {
  return apiKey ? message.split(apiKey).join("[REDACTED]") : message;
}
