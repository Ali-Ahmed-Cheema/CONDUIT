import type { ChatGenerationOptions, ChatMessage, ProviderId, TokenUsage } from "@conduit/core";

export interface ModelRecord {
  id: string;
  chat: boolean;
}

export interface Provider {
  id: ProviderId;
  name: string;
  baseUrl: string;
  keyPriority: number;
  matchesKey: (key: string) => boolean;
  listModels: (key: string, signal: AbortSignal) => Promise<ModelRecord[]>;
  chat: (
    key: string,
    model: string,
    messages: ChatMessage[],
    signal: AbortSignal,
    options?: ChatGenerationOptions,
  ) => Promise<Response>;
  extractDelta: (event: unknown) => string;
  extractModel: (event: unknown) => string | undefined;
  extractUsage: (event: unknown) => TokenUsage | undefined;
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

function messagesPayload(messages: ChatMessage[], systemPrompt?: string) {
  const prompt = systemPrompt?.trim();
  return [
    ...(prompt ? [{ role: "system" as const, content: prompt }] : []),
    ...messages
      .filter((message) => message.role !== "system" && message.content.trim().length > 0)
      .map(({ role, content }) => ({ role, content })),
  ];
}

function numberField(value: unknown, key: string): number | undefined {
  if (!value || typeof value !== "object" || !(key in value)) return undefined;
  const field = (value as Record<string, unknown>)[key];
  return typeof field === "number" && Number.isFinite(field) && field >= 0 ? field : undefined;
}

function usageFields(value: unknown, inputKey: string, outputKey: string): TokenUsage | undefined {
  const input = numberField(value, inputKey);
  const output = numberField(value, outputKey);
  return input === undefined && output === undefined ? undefined : { input, output };
}

const openAiCompatible = (
  id: ProviderId,
  name: string,
  baseUrl: string,
  matchesKey: (key: string) => boolean,
  keyPriority: number,
): Provider => ({
  id,
  name,
  baseUrl,
  keyPriority,
  matchesKey,
  async listModels(key, signal) {
    const response = await fetch(`${baseUrl}/models`, {
      headers: { Authorization: `Bearer ${key}` },
      signal,
    });
    return openAiModels(await providerJson(response));
  },
  chat(key, model, messages, signal, options = {}) {
    const generation = {
      ...(options.temperature === undefined ? {} : { temperature: options.temperature }),
      ...(options.maxTokens === undefined ? {} : { max_tokens: options.maxTokens }),
    };
    return fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: messagesPayload(messages, options.systemPrompt),
        stream: true,
        ...(id === "openai" ? { stream_options: { include_usage: true } } : {}),
        ...generation,
      }),
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
  extractUsage(event) {
    const usage = (event as { usage?: unknown } | null)?.usage;
    return usageFields(usage, "prompt_tokens", "completion_tokens");
  },
});

const openAiCompatibleConfigs: Array<{
  id: ProviderId;
  name: string;
  baseUrl: string;
  matchesKey: (key: string) => boolean;
  keyPriority: number;
}> = [
  { id: "openai", name: "OpenAI", baseUrl: "https://api.openai.com/v1", matchesKey: (key) => key.startsWith("sk-"), keyPriority: 0 },
  { id: "groq", name: "Groq", baseUrl: "https://api.groq.com/openai/v1", matchesKey: (key) => key.startsWith("gsk_"), keyPriority: 1 },
  { id: "openrouter", name: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", matchesKey: (key) => key.startsWith("sk-or-"), keyPriority: 1 },
  {
    id: "huggingface",
    name: "Hugging Face",
    baseUrl: "https://router.huggingface.co/v1",
    matchesKey: (key) => key.startsWith("hf_"),
    keyPriority: 1,
  },
  { id: "mistral", name: "Mistral AI", baseUrl: "https://api.mistral.ai/v1", matchesKey: () => false, keyPriority: 1 },
];

const openAiCompatibleProviders = openAiCompatibleConfigs.map(({ id, name, baseUrl, matchesKey, keyPriority }) =>
  openAiCompatible(id, name, baseUrl, matchesKey, keyPriority),
);

const providers: Provider[] = [
  ...openAiCompatibleProviders,
  {
    id: "anthropic",
    name: "Anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    keyPriority: 1,
    matchesKey: (key) => key.startsWith("sk-ant-"),
    async listModels(key, signal) {
      const response = await fetch("https://api.anthropic.com/v1/models", {
        headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
        signal,
      });
      return openAiModels(await providerJson(response));
    },
    chat(key, model, messages, signal, options = {}) {
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
          max_tokens: options.maxTokens ?? 2048,
          messages: chatMessages,
          stream: true,
          ...(options.systemPrompt?.trim() ? { system: options.systemPrompt.trim() } : {}),
          ...(options.temperature === undefined ? {} : { temperature: options.temperature }),
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
    extractUsage(event) {
      const value = event as {
        type?: string;
        message?: { usage?: unknown };
        usage?: unknown;
      } | null;
      if (value?.type === "message_start") return usageFields(value.message?.usage, "input_tokens", "output_tokens");
      if (value?.type === "message_delta") return usageFields(value.usage, "input_tokens", "output_tokens");
      return undefined;
    },
  },
  {
    id: "google",
    name: "Google Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    keyPriority: 1,
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
    chat(key, model, messages, signal, options = {}) {
      const contents = messagesPayload(messages).map((message) => ({
        role: message.role === "assistant" ? "model" : "user",
        parts: [{ text: message.content }],
      }));
      const generationConfig = {
        ...(options.temperature === undefined ? {} : { temperature: options.temperature }),
        ...(options.maxTokens === undefined ? {} : { maxOutputTokens: options.maxTokens }),
      };
      return fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`,
        {
          method: "POST",
          headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
          body: JSON.stringify({
            contents,
            ...(options.systemPrompt?.trim()
              ? { systemInstruction: { parts: [{ text: options.systemPrompt.trim() }] } }
              : {}),
            ...(Object.keys(generationConfig).length > 0 ? { generationConfig } : {}),
          }),
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
    extractUsage(event) {
      const usage = (event as { usageMetadata?: unknown } | null)?.usageMetadata;
      return usageFields(usage, "promptTokenCount", "candidatesTokenCount");
    },
  },
];

export function getProviderHint(key: string): Provider | undefined {
  return providers
    .filter((provider) => provider.matchesKey(key))
    .sort((first, second) => second.keyPriority - first.keyPriority)[0];
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
