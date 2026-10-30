import "dotenv/config";
import { config as loadDotenv } from "dotenv";
import express from "express";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  ActiveConnectionRequestSchema,
  ChatGenerationOptionsSchema,
  ChatRequestSchema,
  ValidateKeyRequestSchema,
  ValidationIdRequestSchema,
} from "@conduit/core";
import { getServerFeatureFlags } from "./featureFlags";
import { createTypedApiMiddleware } from "./v4Api";
import type { ChatGenerationOptions, ChatMessage, ProviderId } from "../src/types";
import {
  decryptApiKey,
  encryptApiKey,
  readStore,
  validateEncryptionKey,
  writeStore,
  type StoredConnection,
} from "./keyStore";
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
import { apiSecurityHeaders, staticSecurityHeaders } from "./securityHeaders";

loadDotenv({ path: resolve(process.cwd(), "../../.env") });
const app = express();
const port = Number(process.env.PORT ?? 3001);
const productionMode = process.env.NODE_ENV === "production" || process.argv.includes("--production");
export { app };
const candidates = new Map<
  string,
  { provider: ProviderId; key: string; models: string[]; environment: string; expiresAt: number }
>();
const candidateClaims = new Set<string>();
const rateLimits = new Map<string, { count: number; resetAt: number }>();
let storeMutationQueue = Promise.resolve();

async function withStoreMutationLock<T>(operation: () => Promise<T>): Promise<T> {
  const previous = storeMutationQueue;
  let release: () => void = () => undefined;
  storeMutationQueue = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    return await operation();
  } finally {
    release();
  }
}

app.disable("x-powered-by");
app.use((_request, response, next) => {
  response.set(apiSecurityHeaders);
  response.set("Cache-Control", "no-store");
  next();
});
app.use((request, response, next) => {
  const host = request.get("host");
  try {
    const hostname = host ? new URL(`http://${host}`).hostname : "";
    if (hostname !== "localhost" && hostname !== "127.0.0.1") {
      response.status(403).json({ error: "Requests must use a localhost host name." });
      return;
    }
  } catch {
    response.status(403).json({ error: "Requests must use a valid localhost host name." });
    return;
  }
  next();
});
const allowedOrigins = new Set([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  `http://localhost:${port}`,
  `http://127.0.0.1:${port}`,
]);
app.use((request, response, next) => {
  if (request.method !== "GET" && !allowedOrigins.has(request.get("origin") ?? "")) {
    response.status(403).json({ error: "This request origin is not allowed." });
    return;
  }
  next();
});
app.use(express.json({ limit: "64kb" }));
app.use("/api/v4", createTypedApiMiddleware(() => getServerFeatureFlags().typedApi));

function rateLimit(maximum: number, windowMs: number): express.RequestHandler {
  return (request, response, next) => {
    const now = Date.now();
    const key = `${request.path}:${request.ip}`;
    let bucket = rateLimits.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      rateLimits.set(key, bucket);
    }
    if (bucket.count >= maximum) {
      response.set("Retry-After", String(Math.ceil((bucket.resetAt - now) / 1000)));
      response.status(429).json({ error: "Too many requests. Try again later." });
      return;
    }
    bucket.count += 1;
    if (rateLimits.size > 10_000) {
      for (const [entry, value] of rateLimits) {
        if (value.resetAt <= now) rateLimits.delete(entry);
      }
    }
    next();
  };
}

function isTransientProviderStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status < 600);
}

function retryDelay(attempt: number, response?: Response): number {
  const fallback = 250 * 2 ** attempt;
  const retryAfter = response?.headers.get("retry-after");
  if (!retryAfter) return fallback;
  const seconds = Number(retryAfter);
  const dateDelay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retryAfter) - Date.now();
  return Number.isFinite(dateDelay) && dateDelay > 0 ? Math.min(2_000, Math.max(fallback, dateDelay)) : fallback;
}

function waitBeforeRetry(delayMs: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      const error = new Error("The client closed the request.");
      error.name = "AbortError";
      reject(error);
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      const error = new Error("The client closed the request.");
      error.name = "AbortError";
      reject(error);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

async function startProviderStream(
  provider: Provider,
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  options: ChatGenerationOptions,
  signal: AbortSignal,
): Promise<{
  reader: ReadableStreamDefaultReader<Uint8Array>;
  firstChunk: ReadableStreamReadResult<Uint8Array>;
}> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (signal.aborted) {
      const error = new Error("The client closed the request.");
      error.name = "AbortError";
      throw error;
    }
    let upstream: Response;
    try {
      upstream = await provider.chat(apiKey, model, messages, signal, options);
    } catch (error) {
      lastError = error;
      if (attempt === 2 || signal.aborted) throw error;
      await waitBeforeRetry(retryDelay(attempt), signal);
      continue;
    }
    if (!upstream.ok) {
      const error = await providerResponseError(upstream);
      if (!isTransientProviderStatus(upstream.status) || attempt === 2) throw error;
      lastError = error;
      await waitBeforeRetry(retryDelay(attempt, upstream), signal);
      continue;
    }
    if (!upstream.body) throw new ProviderRequestError("Provider returned no response body.", upstream.status);
    const reader = upstream.body.getReader();
    try {
      while (true) {
        const firstChunk = await reader.read();
        if (firstChunk.done) {
          throw new ProviderRequestError("Provider returned an empty streaming response.", 502);
        }
        if (firstChunk.value.byteLength > 0) return { reader, firstChunk };
      }
    } catch (error) {
      await reader.cancel(error).catch(() => undefined);
      lastError = error;
      if (attempt === 2 || signal.aborted) throw error;
      await waitBeforeRetry(retryDelay(attempt), signal);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Provider request failed.");
}

function publicConnection(connection: StoredConnection) {
  const { encryptedKey: _encryptedKey, ...safe } = connection;
  return {
    ...safe,
    keyHint: `${"*".repeat(16)}${safe.keyHint.slice(-4)}`,
    models: safe.models,
    status: safe.status ?? "valid",
    lastValidatedAt: safe.lastValidatedAt ?? safe.addedAt,
  };
}

async function updateConnectionStatus(connectionId: string, status: NonNullable<StoredConnection["status"]>) {
  await withStoreMutationLock(async () => {
    const store = await readStore();
    const connection = store.connections.find((item) => item.id === connectionId);
    if (!connection) return;
    connection.status = status;
    await writeStore(store);
  });
}

async function recordProviderStatus(connectionId: string, error: unknown) {
  if (!(error instanceof ProviderRequestError)) return;
  const status = error.status === 401 || error.status === 403
    ? "invalid"
    : error.status === 429
      ? "rate-limited"
      : undefined;
  if (!status) return;
  try {
    await updateConnectionStatus(connectionId, status);
  } catch {
    console.error("CONDUIT connection status update failed.");
  }
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

app.post("/api/validate", rateLimit(10, 60_000), async (request, response) => {
  const parsedInput = ValidateKeyRequestSchema.safeParse(request.body);
  if (!parsedInput.success) {
    response.status(400).json({ error: "Enter an API key with at least 8 characters." });
    return;
  }
  const { apiKey, probeUnknown, environment } = parsedInput.data;
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
        environment,
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
  const parsedInput = ValidationIdRequestSchema.safeParse(request.body);
  if (!parsedInput.success) {
    response.status(400).json({ code: "VALIDATION_EXPIRED", error: "Validate the key again to continue." });
    return;
  }
  const { validationId } = parsedInput.data;
  const candidate = candidates.get(validationId);
  if (!candidate || candidate.expiresAt <= Date.now()) {
    candidates.delete(validationId);
    response.status(400).json({
      code: "VALIDATION_EXPIRED",
      error: "The key validation expired or the API service restarted. Validate the key again to continue.",
    });
    return;
  }
  if (candidateClaims.has(validationId)) {
    response.status(409).json({ code: "VALIDATION_IN_USE", error: "This key validation is already being used." });
    return;
  }
  candidateClaims.add(validationId);
  try {
    await withStoreMutationLock(async () => {
      if (candidates.get(validationId) !== candidate || candidate.expiresAt <= Date.now()) {
        candidates.delete(validationId);
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
        candidates.delete(validationId);
        response.status(409).json({ error: "This API key is already saved." });
        return;
      }
      const validatedAt = new Date().toISOString();
      const connection: StoredConnection = {
        id: randomUUID(),
        provider: provider.id,
        providerName: provider.name,
        environment: candidate.environment,
        keyHint: `${"*".repeat(16)}${candidate.key.slice(-4)}`,
        models: candidate.models,
        addedAt: validatedAt,
        status: "valid",
        lastValidatedAt: validatedAt,
        encryptedKey: encryptApiKey(candidate.key),
      };
      store.connections.push(connection);
      store.activeId = connection.id;
      await writeStore(store);
      candidates.delete(validationId);
      response.status(201).json({
        connections: store.connections.map(publicConnection),
        activeId: store.activeId,
      });
    });
  } catch (error) {
    next(error);
  } finally {
    candidateClaims.delete(validationId);
  }
});

app.delete("/api/connections", async (_request, response, next) => {
  try {
    await withStoreMutationLock(async () => {
      const store = { connections: [], activeId: null };
      await writeStore(store);
      response.json(store);
    });
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
    await withStoreMutationLock(async () => {
      const currentStore = await readStore();
      const currentConnection = currentStore.connections.find((item) => item.id === request.params.id);
      if (!currentConnection) {
        response.status(404).json({ error: "That saved connection no longer exists." });
        return;
      }
      if (JSON.stringify(currentConnection.encryptedKey) !== JSON.stringify(connection.encryptedKey)) {
        response.status(409).json({ error: "This connection changed while models were refreshing. Try again." });
        return;
      }
      currentConnection.models = chatModels;
      currentConnection.status = "valid";
      currentConnection.lastValidatedAt = new Date().toISOString();
      await writeStore(currentStore);
      response.json({ connections: currentStore.connections.map(publicConnection), activeId: currentStore.activeId });
    });
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      await recordProviderStatus(request.params.id, error);
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

app.put("/api/connections/active", async (request, response, next) => {
  try {
    const parsedInput = ActiveConnectionRequestSchema.safeParse(request.body);
    if (!parsedInput.success) {
      response.status(400).json({ error: "Choose a saved API connection." });
      return;
    }
    const { id } = parsedInput.data;
    await withStoreMutationLock(async () => {
      const store = await readStore();
      if (id !== null && (typeof id !== "string" || !store.connections.some((connection) => connection.id === id))) {
        response.status(400).json({ error: "Choose a saved API connection." });
        return;
      }
      store.activeId = typeof id === "string" ? id : null;
      await writeStore(store);
      await sendConnections(response);
    });
  } catch (error) {
    next(error);
  }
});

app.put("/api/connections/:id", async (request, response, next) => {
  const parsedInput = ValidationIdRequestSchema.safeParse(request.body);
  if (!parsedInput.success) {
    response.status(400).json({
      code: "VALIDATION_EXPIRED",
      error: "The key validation expired or the API service restarted. Validate the replacement key again to continue.",
    });
    return;
  }
  const { validationId } = parsedInput.data;
  const candidate = candidates.get(validationId);
  if (!candidate || candidate.expiresAt <= Date.now()) {
    candidates.delete(validationId);
    response.status(400).json({
      code: "VALIDATION_EXPIRED",
      error: "The key validation expired or the API service restarted. Validate the replacement key again to continue.",
    });
    return;
  }
  if (candidateClaims.has(validationId)) {
    response.status(409).json({ code: "VALIDATION_IN_USE", error: "This key validation is already being used." });
    return;
  }
  candidateClaims.add(validationId);
  try {
    await withStoreMutationLock(async () => {
      if (candidates.get(validationId) !== candidate || candidate.expiresAt <= Date.now()) {
        candidates.delete(validationId);
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
      if (store.connections.some((item) => item.id !== connection.id && decryptApiKey(item.encryptedKey) === candidate.key)) {
        response.status(409).json({ error: "This API key is already saved." });
        return;
      }
      connection.provider = provider.id;
      connection.providerName = provider.name;
      connection.environment = candidate.environment;
      connection.keyHint = `${"*".repeat(16)}${candidate.key.slice(-4)}`;
      connection.models = candidate.models;
      connection.addedAt = new Date().toISOString();
      connection.status = "valid";
      connection.lastValidatedAt = connection.addedAt;
      connection.encryptedKey = encryptApiKey(candidate.key);
      store.activeId = connection.id;
      await writeStore(store);
      candidates.delete(validationId);
      response.json({
        connections: store.connections.map(publicConnection),
        activeId: store.activeId,
      });
    });
  } catch (error) {
    next(error);
  } finally {
    candidateClaims.delete(validationId);
  }
});

app.delete("/api/connections/:id", async (request, response, next) => {
  try {
    await withStoreMutationLock(async () => {
      const store = await readStore();
      store.connections = store.connections.filter((connection) => connection.id !== request.params.id);
      if (store.activeId === request.params.id) store.activeId = store.connections[0]?.id ?? null;
      await writeStore(store);
      await sendConnections(response);
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/chat/stream", rateLimit(30, 60_000), async (request, response) => {
  const parsedOptions = ChatGenerationOptionsSchema.safeParse(request.body);
  if (!parsedOptions.success) {
    response.status(400).json({ error: "Generation options are outside the supported ranges." });
    return;
  }
  const parsedRequest = ChatRequestSchema.safeParse(request.body);
  if (!parsedRequest.success) {
    response.status(400).json({ error: "A connection, model, and conversation history are required." });
    return;
  }
  const { connectionId, model, messages, systemPrompt, temperature, maxTokens } = parsedRequest.data;

  let streamProvider: Provider;
  let upstreamReader: ReadableStreamDefaultReader<Uint8Array>;
  let firstChunk: ReadableStreamReadResult<Uint8Array>;
  let activeSecret = "";
  let connectionIdForStatus: string | null = null;
  try {
    const store = await readStore();
    const connection = store.connections.find((item) => item.id === connectionId);
    if (!connection) {
      response.status(404).json({ error: "That API connection no longer exists." });
      return;
    }
    connectionIdForStatus = connection.id;
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
    const options: ChatGenerationOptions = {
      ...(typeof systemPrompt === "string" ? { systemPrompt: redactApiKey(systemPrompt, activeSecret) } : {}),
      ...(typeof temperature === "number" ? { temperature } : {}),
      ...(typeof maxTokens === "number" ? { maxTokens } : {}),
    };
    const streamStart = await startProviderStream(
      provider,
      activeSecret,
      model,
      safeMessages,
      options,
      controller.signal,
    );
    upstreamReader = streamStart.reader;
    firstChunk = streamStart.firstChunk;
  } catch (error) {
    if (connectionIdForStatus) await recordProviderStatus(connectionIdForStatus, error);
    response.status(error instanceof ProviderRequestError ? error.status ?? 502 : 502)
      .json({ error: redactApiKey(providerFailureMessage(error), activeSecret) });
    return;
  }

  response.status(200).set({
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
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
    const usage = streamProvider.extractUsage(event);
    if (usage) response.write(`data: ${JSON.stringify({ usage })}\n\n`);
    const delta = streamProvider.extractDelta(event);
    if (delta) {
      response.write(`data: ${JSON.stringify({ delta: redactApiKey(delta, activeSecret) })}\n\n`);
    }
  };
  try {
    let nextChunk = firstChunk;
    while (true) {
      const { done, value } = nextChunk;
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) forwardLine(line);
      if (done) {
        if (buffer.trim()) forwardLine(buffer);
        break;
      }
      nextChunk = await upstreamReader.read();
    }
    response.end("data: {\"done\":true}\n\n");
  } catch (error) {
    if (!response.headersSent) response.status(502);
    const streamError = {
      error: redactApiKey(providerFailureMessage(error), activeSecret),
      ...(error instanceof ProviderRequestError && error.status ? { status: error.status } : {}),
    };
    response.end(`data: ${JSON.stringify(streamError)}\n\n`);
    if (connectionIdForStatus) await recordProviderStatus(connectionIdForStatus, error);
    await upstreamReader.cancel(error).catch(() => undefined);
  }
});

if (productionMode) {
  const distDirectory = resolve(process.cwd(), "dist");
  app.use(express.static(distDirectory, {
    setHeaders(response, filePath) {
      response.set(staticSecurityHeaders);
      if (/(?:^|[\\/])(?:index\.html|sw\.js|workbox-[^\\/]+\.js|manifest\.webmanifest)$/i.test(filePath)) {
        response.set("Cache-Control", "no-cache");
      } else if (/[\\/]assets[\\/]/.test(filePath)) {
        response.set("Cache-Control", "public, max-age=31536000, immutable");
      } else {
        response.set("Cache-Control", "public, max-age=86400");
      }
    },
  }));
  app.use((request, response, next) => {
    if (
      (request.method !== "GET" && request.method !== "HEAD") ||
      request.path === "/api" ||
      request.path.startsWith("/api/")
    ) {
      next();
      return;
    }
    response.set(staticSecurityHeaders);
    response.set("Cache-Control", "no-cache");
    response.sendFile(resolve(distDirectory, "index.html"), (error) => {
      if (error) next(error);
    });
  });
}

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

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    validateEncryptionKey();
  } catch (error) {
    console.error(error instanceof Error ? error.message : "CONDUIT_ENCRYPTION_KEY is invalid.");
    process.exitCode = 1;
  }
  if (process.exitCode !== 1) {
    const host = process.env.CONDUIT_EXPOSE === "1" ? "0.0.0.0" : "127.0.0.1";
    app.listen(port, host, () => {
      console.log(`CONDUIT listening on http://127.0.0.1:${port}`);
    });
  }
}
