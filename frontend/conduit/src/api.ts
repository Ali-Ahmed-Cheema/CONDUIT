import type { ConnectionsResponse, ValidationResult, ChatMessage } from "./types";

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly code?: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string; code?: string } | null;
    throw new ApiRequestError(body?.error ?? `Request failed (${response.status})`, body?.code, response.status);
  }
  return response.json() as Promise<T>;
}

export const getConnections = () => request<ConnectionsResponse>("/api/connections");

export const validateKey = (apiKey: string, probeUnknown: boolean) =>
  request<ValidationResult>("/api/validate", {
    method: "POST",
    body: JSON.stringify({ apiKey, probeUnknown }),
  });

export const addConnection = (validationId: string) =>
  request<ConnectionsResponse>("/api/connections", {
    method: "POST",
    body: JSON.stringify({ validationId }),
  });

export const replaceConnection = (id: string, validationId: string) =>
  request<ConnectionsResponse>(`/api/connections/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify({ validationId }),
  });

export const refreshConnection = (id: string) =>
  request<ConnectionsResponse>(`/api/connections/${encodeURIComponent(id)}/refresh`, { method: "POST" });

export const setActiveConnection = (id: string | null) =>
  request<ConnectionsResponse>("/api/connections/active", {
    method: "PUT",
    body: JSON.stringify({ id }),
  });

export const removeConnection = (id: string) =>
  request<ConnectionsResponse>(`/api/connections/${encodeURIComponent(id)}`, { method: "DELETE" });

export const clearConnections = () =>
  request<ConnectionsResponse>("/api/connections", { method: "DELETE" });

export function limitChatHistory(messages: ChatMessage[], maxMessages = 30, maxCharacters = 48_000): ChatMessage[] {
  const recent: ChatMessage[] = [];
  let characterCount = 0;
  for (let index = messages.length - 1; index >= 0 && recent.length < maxMessages; index -= 1) {
    const message = messages[index];
    const available = maxCharacters - characterCount;
    if (available <= 0) break;
    if (message.content.length > available) {
      if (recent.length === 0) recent.unshift({ ...message, content: message.content.slice(-available) });
      break;
    }
    recent.unshift(message);
    characterCount += message.content.length;
  }
  return recent;
}

export async function streamChat(
  connectionId: string,
  model: string,
  messages: ChatMessage[],
  onDelta: (text: string) => void,
  onModel?: (model: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch("/api/chat/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ connectionId, model, messages }),
    signal,
  });
  if (!response.ok || !response.body) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Chat request failed (${response.status})`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let completed = false;

  const processEvent = (event: string) => {
    const data = event
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).replace(/^ /, ""))
      .join("\n");
    if (!data) return;
    const parsed = JSON.parse(data) as { delta?: string; model?: string; error?: string; done?: boolean };
    if (parsed.error) throw new Error(parsed.error);
    if (parsed.delta) onDelta(parsed.delta);
    if (parsed.model) onModel?.(parsed.model);
    if (parsed.done) completed = true;
  };

  const processBuffer = (flush: boolean) => {
    buffer = buffer.replace(/\r\n/g, "\n");
    const events = buffer.split("\n\n");
    buffer = flush ? "" : events.pop() ?? "";
    for (const event of events) {
      if (event.trim()) processEvent(event);
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      processBuffer(done);
      if (done) break;
    }
  } catch (error) {
    await reader.cancel(error).catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
  if (!completed) throw new Error("The response stream ended unexpectedly. Please try again.");
}
