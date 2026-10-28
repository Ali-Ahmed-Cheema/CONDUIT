import "dotenv/config";
import express from "express";
import { randomUUID } from "node:crypto";
import type { ChatMessage, ProviderId } from "../src/types";
import { decryptApiKey, encryptApiKey, readStore, writeStore, type StoredConnection } from "./keyStore";
import {
  findProvider,
  getChatModels,
  getProviderHint,
  getProviders,
  isCredentialRejection,
  providerResponseError,
  providerStreamError,
  providerFailureMessage,
  ProviderRequestError,
  redactApiKey,
  type Provider,
} from "./providers";

const app = express();
const port = Number(process.env.PORT ?? 3001);
const candidates = new Map<
  string,
  { provider: ProviderId; key: string; models: string[]; expiresAt: number }
>();

app.disable("x-powered-by");
app.use(express.json({ limit: "64kb" }));

function publicConnection(connection: StoredConnection) {
  const { encryptedKey: _encryptedKey, ...safe } = connection;
  return {
    ...safe,
    keyHint: `${"*".repeat(16)}${safe.keyHint.slice(-4)}`,
    models: safe.models,
  };
}

async function sendConnections(response: express.Response) {
  const store = await readStore();
  response.json({ connections: store.connections.map(publicConnection), activeId: store.activeId });
}

app.get("/api/health", (_request, response) => response.json({ ok: true }));
app.get("/api/connections", async (_request, response, next) => {
  try {
    await sendConnections(response);
  } catch (error) {
    next(error);
  }
});

app.post("/api/validate", async (request, response) => {
  const { apiKey, probeUnknown } = request.body as { apiKey?: unknown; probeUnknown?: unknown };
  if (typeof apiKey !== "string" || apiKey.trim().length < 8 || apiKey.length > 4096) {
    response.status(400).json({ error: "Enter an API key with at least 8 characters." });
    return;
  }
  const credential = apiKey.trim();
  if (/^conduit_placeholder/i.test(credential)) {
    response.status(400).json({ error: "The placeholder key is not a real credential and cannot be validated." });
    return;
  }

  const hinted = getProviderHint(credential);
  const providers = hinted ? [hinted] : getProviders();
  if (!hinted && probeUnknown !== true) {
    response.status(400).json({ error: "Consent is required before an unknown key is checked against providers." });
    return;
  }

  let lastError: unknown;
  for (const [id, candidate] of candidates) {
    if (candidate.expiresAt < Date.now()) candidates.delete(id);
  }
  for (const provider of providers) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const models = (await provider.listModels(credential, controller.signal))
        .map((model) => ({ ...model, id: redactApiKey(model.id, credential) }));
      const chatModels = getChatModels(models);
      if (chatModels.length === 0) {
        response.status(422).json({
          error: `The key was accepted by ${provider.name}, but no conversational models were found. Image, audio, embedding, or other non-chat access is not supported.`,
          provider: provider.id,
          models: models.map((model) => model.id),
        });
        return;
      }
      const validationId = randomUUID();
      candidates.set(validationId, {
        provider: provider.id,
        key: credential,
        models: chatModels,
        expiresAt: Date.now() + 30 * 60_000,
      });
      response.json({
        validationId,
        provider: provider.id,
        providerName: provider.name,
        models: models.map((model) => model.id),
        chatModels,
      });
      return;
    } catch (error) {
      lastError = error;
      if (hinted || !isCredentialRejection(error)) {
        response.status(error instanceof ProviderRequestError ? error.status ?? 502 : 502)
          .json({ error: redactApiKey(providerFailureMessage(error), credential) });
        return;
      }
    } finally {
      clearTimeout(timeout);
    }
  }
  response.status(401).json({
    error: redactApiKey(
      providerFailureMessage(lastError ?? new Error("No supported provider accepted this key.")),
      credential,
    ),
  });
});

app.post("/api/connections", async (request, response, next) => {
  try {
    const { validationId } = request.body as { validationId?: unknown };
    const candidate = typeof validationId === "string" ? candidates.get(validationId) : undefined;
    if (!candidate || candidate.expiresAt < Date.now()) {
      if (typeof validationId === "string") candidates.delete(validationId);
      response.status(400).json({
        code: "VALIDATION_EXPIRED",
        error: "The key validation expired or the API service restarted. Validate the key again to continue.",
      });
      return;
    }
    const provider = findProvider(candidate.provider);
    if (!provider) {
      response.status(500).json({ error: "The validated provider is no longer supported." });
      return;
    }
    const store = await readStore();
    if (store.connections.length >= 10) {
      response.status(409).json({ error: "You can save up to 10 API connections." });
      return;
    }
    if (store.connections.some((connection) => decryptApiKey(connection.encryptedKey) === candidate.key)) {
      candidates.delete(validationId as string);
      response.status(409).json({ error: "This API key is already saved." });
      return;
    }
    const connection: StoredConnection = {
      id: randomUUID(),
      provider: provider.id,
      providerName: provider.name,
      keyHint: `${"*".repeat(16)}${candidate.key.slice(-4)}`,
      models: candidate.models,
      addedAt: new Date().toISOString(),
      encryptedKey: encryptApiKey(candidate.key),
    };
    store.connections.push(connection);
    store.activeId = connection.id;
    await writeStore(store);
    candidates.delete(validationId as string);
    response.status(201).json({
      connections: store.connections.map(publicConnection),
      activeId: store.activeId,
    });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/connections", async (_request, response, next) => {
  try {
    const store = { connections: [], activeId: null };
    await writeStore(store);
    response.json(store);
  } catch (error) {
    next(error);
  }
});

app.post("/api/connections/:id/refresh", async (request, response, next) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  let activeSecret = "";
  try {
    const store = await readStore();
    const connection = store.connections.find((item) => item.id === request.params.id);
    if (!connection) {
      response.status(404).json({ error: "That saved connection no longer exists." });
      return;
    }
    const provider = findProvider(connection.provider);
    if (!provider) {
      response.status(500).json({ error: "This provider is not supported." });
      return;
    }
    activeSecret = decryptApiKey(connection.encryptedKey);
    const models = await provider.listModels(activeSecret, controller.signal);
    const chatModels = getChatModels(models);
    if (chatModels.length === 0) {
      response.status(422).json({ error: "The key is valid, but no conversational models are available." });
      return;
    }
    connection.models = chatModels;
    await writeStore(store);
    response.json({ connections: store.connections.map(publicConnection), activeId: store.activeId });
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      response.status(error.status ?? 502).json({
        error: redactApiKey(providerFailureMessage(error), activeSecret),
      });
    } else {
      next(error);
    }
  } finally {
    clearTimeout(timeout);
  }
});

app.put("/api/connections/:id", async (request, response, next) => {
  try {
    const { validationId } = request.body as { validationId?: unknown };
    const candidate = typeof validationId === "string" ? candidates.get(validationId) : undefined;
    if (!candidate || candidate.expiresAt < Date.now()) {
      if (typeof validationId === "string") candidates.delete(validationId);
      response.status(400).json({
        code: "VALIDATION_EXPIRED",
        error: "The key validation expired or the API service restarted. Validate the replacement key again to continue.",
      });
      return;
    }
    const store = await readStore();
    const connection = store.connections.find((item) => item.id === request.params.id);
    if (!connection) {
      response.status(404).json({ error: "That saved connection no longer exists." });
      return;
    }
    const provider = findProvider(candidate.provider);
    if (!provider) {
      response.status(500).json({ error: "The validated provider is no longer supported." });
      return;
    }
    connection.provider = provider.id;
    connection.providerName = provider.name;
    connection.keyHint = `${"*".repeat(16)}${candidate.key.slice(-4)}`;
    connection.models = candidate.models;
    connection.addedAt = new Date().toISOString();
    connection.encryptedKey = encryptApiKey(candidate.key);
    store.activeId = connection.id;
    await writeStore(store);
    candidates.delete(validationId as string);
    response.json({
      connections: store.connections.map(publicConnection),
      activeId: store.activeId,
    });
  } catch (error) {
    next(error);
  }
});

app.put("/api/connections/active", async (request, response, next) => {
  try {
    const { id } = request.body as { id?: unknown };
    const store = await readStore();
    if (id !== null && (typeof id !== "string" || !store.connections.some((connection) => connection.id === id))) {
      response.status(400).json({ error: "Choose a saved API connection." });
      return;
    }
    store.activeId = id as string | null;
    await writeStore(store);
    await sendConnections(response);
  } catch (error) {
    next(error);
  }
});

app.delete("/api/connections/:id", async (request, response, next) => {
  try {
    const store = await readStore();
    store.connections = store.connections.filter((connection) => connection.id !== request.params.id);
    if (store.activeId === request.params.id) store.activeId = store.connections[0]?.id ?? null;
    await writeStore(store);
    await sendConnections(response);
  } catch (error) {
    next(error);
  }
});

app.post("/api/chat/stream", async (request, response) => {
  const { connectionId, model, messages } = request.body as {
    connectionId?: unknown;
    model?: unknown;
    messages?: unknown;
  };
  if (
    typeof connectionId !== "string" ||
    typeof model !== "string" ||
    !Array.isArray(messages) ||
    messages.length === 0 ||
    messages.length > 100 ||
    !messages.every(
      (message): message is ChatMessage =>
        !!message &&
        typeof message === "object" &&
        ["user", "assistant"].includes((message as ChatMessage).role) &&
        typeof (message as ChatMessage).content === "string",
    )
  ) {
    response.status(400).json({ error: "A connection, model, and conversation history are required." });
    return;
  }

  let upstream: Response;
  let streamProvider: Provider;
  let activeSecret = "";
  try {
    const store = await readStore();
    const connection = store.connections.find((item) => item.id === connectionId);
    if (!connection) {
      response.status(404).json({ error: "That API connection no longer exists." });
      return;
    }
    if (!connection.models.includes(model)) {
      response.status(400).json({ error: "Choose a conversational model available to this connection." });
      return;
    }
    const provider = findProvider(connection.provider);
    if (!provider) {
      response.status(500).json({ error: "This provider is not supported." });
      return;
    }
    streamProvider = provider;
    activeSecret = decryptApiKey(connection.encryptedKey);
    const controller = new AbortController();
    response.on("close", () => {
      if (!response.writableEnded) controller.abort();
    });
    const safeMessages = messages.map((message) => ({
      ...message,
      content: redactApiKey(message.content, activeSecret),
    }));
    upstream = await provider.chat(activeSecret, model, safeMessages, controller.signal);
    if (!upstream.ok || !upstream.body) {
      const error = upstream.ok
        ? new ProviderRequestError("Provider returned no response body.", upstream.status)
        : await providerResponseError(upstream);
      response.status(upstream.ok ? 502 : upstream.status).json({
        error: redactApiKey(providerFailureMessage(error), activeSecret),
      });
      return;
    }
  } catch (error) {
    response.status(502).json({ error: redactApiKey(providerFailureMessage(error), activeSecret) });
    return;
  }

  response.status(200).set({
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  const reader = upstream.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const forwardLine = (line: string) => {
    if (!line.startsWith("data:")) return;
    const raw = line.slice(5).trim();
    if (!raw || raw === "[DONE]") return;
    let event: unknown;
    try {
      event = JSON.parse(raw);
    } catch {
      throw new Error("The provider returned an invalid streaming response.");
    }
    const providerError = providerStreamError(event);
    if (providerError) throw providerError;
    const actualModel = streamProvider.extractModel(event);
    if (actualModel) response.write(`data: ${JSON.stringify({ model: actualModel })}\n\n`);
    const delta = streamProvider.extractDelta(event);
    if (delta) {
      response.write(`data: ${JSON.stringify({ delta: redactApiKey(delta, activeSecret) })}\n\n`);
    }
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) forwardLine(line);
      if (done) {
        if (buffer.trim()) forwardLine(buffer);
        break;
      }
    }
    response.end("data: {\"done\":true}\n\n");
  } catch (error) {
    if (!response.headersSent) response.status(502);
    response.end(`data: ${JSON.stringify({ error: redactApiKey(providerFailureMessage(error), activeSecret) })}\n\n`);
  }
});



app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  if (
    error &&
    typeof error === "object" &&
    "type" in error &&
    error.type === "entity.parse.failed"
  ) {
    response.status(400).json({ error: "Request body must contain valid JSON." });
    return;
  }
  console.error("CONDUIT request failed.");
  if (!response.headersSent) response.status(500).json({ error: "The request could not be completed." });
  else response.end();
});

app.listen(port, "127.0.0.1", () => {
  console.log(`CONDUIT API listening on http://127.0.0.1:${port}`);
});
