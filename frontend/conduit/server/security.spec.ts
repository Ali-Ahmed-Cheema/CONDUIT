import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import supertest from "supertest";
import type { StoredConnection } from "./keyStore";

const { decryptApiKey, readStore, writeStore } = vi.hoisted(() => ({
  decryptApiKey: vi.fn(),
  readStore: vi.fn(),
  writeStore: vi.fn(),
}));

vi.mock("./keyStore", () => ({
  decryptApiKey,
  encryptApiKey: vi.fn((plainText: string) => ({ iv: "", tag: "", ciphertext: plainText })),
  readStore,
  validateEncryptionKey: vi.fn(),
  writeStore,
}));

import { app } from "./index";

const allowedOrigin = "http://localhost:5173";
const secret = "sk-test-secret-1234";
let persistedStore: { connections: StoredConnection[]; activeId: string | null } = { connections: [], activeId: null };

async function apiRequest(
  path: string,
  options: { method?: string; body?: unknown; origin?: string; host?: string } = {},
): Promise<Response> {
  const method = options.method?.toUpperCase() ?? "GET";
  let test = method === "POST"
    ? supertest(app).post(path)
    : method === "PUT"
      ? supertest(app).put(path)
      : method === "DELETE"
        ? supertest(app).delete(path)
        : supertest(app).get(path);
  if (options.origin !== undefined) test = test.set("Origin", options.origin);
  if (options.host !== undefined) test = test.set("Host", options.host);
  if (options.body !== undefined) {
    test = test.set("Content-Type", "application/json").send(JSON.stringify(options.body));
  }
  const result = await test;
  const headers = new Headers();
  for (const [name, value] of Object.entries(result.headers)) {
    if (value !== undefined) headers.set(name, String(value));
  }
  return new Response(result.text ?? "", { status: result.status, headers });
}

async function validateApiKey(apiKey: string): Promise<string> {
  const response = await apiRequest("/api/validate", {
    method: "POST",
    body: { apiKey },
    origin: allowedOrigin,
  });
  if (!response.ok) throw new Error(`Key validation failed with status ${response.status}.`);
  const result = await response.json() as { validationId: string };
  return result.validationId;
}

beforeEach(() => {
  vi.restoreAllMocks();
  persistedStore = { connections: [], activeId: null };
  readStore.mockImplementation(async () => structuredClone(persistedStore));
  writeStore.mockImplementation(async (store: { connections: StoredConnection[]; activeId: string | null }) => {
    persistedStore = structuredClone(store);
  });
  decryptApiKey.mockReturnValue(secret);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("API security middleware", () => {
  it("sets security headers without enabling CORS", async () => {
    const response = await apiRequest("/api/health");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("rejects non-local Host headers", async () => {
    const response = await apiRequest("/api/health", { host: "attacker.example" });

    expect(response.status).toBe(403);
  });

  it("requires non-GET requests to use an allowed origin", async () => {
    const denied = await apiRequest("/api/validate", {
      method: "POST",
      body: { apiKey: "not-a-real-key" },
      origin: "https://attacker.example",
    });
    const accepted = await apiRequest("/api/validate", {
      method: "POST",
      body: { apiKey: "short" },
      origin: allowedOrigin,
    });

    expect(denied.status).toBe(403);
    expect(accepted.status).toBe(400);
  });

});

describe("provider error redaction", () => {
  it("redacts keys reflected in provider validation errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ error: { message: `Provider rejected ${secret}` } }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    )));

    const response = await apiRequest("/api/validate", {
      method: "POST",
      body: { apiKey: secret },
      origin: allowedOrigin,
    });
    const result = await response.text();

    expect(response.status).toBe(401);
    expect(result).not.toContain(secret);
  });

  it("redacts keys reflected in SSE errors and never sends them in prompts", async () => {
    readStore.mockResolvedValue({
      connections: [{
        id: "connection",
        provider: "openai",
        models: ["gpt-test"],
        encryptedKey: { iv: "", tag: "", ciphertext: "" },
      }],
      activeId: "connection",
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      `data: ${JSON.stringify({ error: `Provider rejected ${secret}`, status: 401 })}\n\n`,
      { status: 200, headers: { "Content-Type": "text/event-stream" } },
    )));

    const response = await apiRequest("/api/chat/stream", {
      method: "POST",
      body: {
        connectionId: "connection",
        model: "gpt-test",
        messages: [{ role: "user", content: `Do not log ${secret}` }],
      },
      origin: allowedOrigin,
    });
    const result = await response.text();

    expect(result).not.toContain(secret);
    expect(result).toContain("[REDACTED]");
    const providerRequest = vi.mocked(fetch).mock.calls[0]?.[1];
    expect(String(providerRequest?.body)).not.toContain(secret);
  });

  it("logs only a generic message for server errors", async () => {
    const logError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    readStore.mockRejectedValueOnce(new Error(`private prompt and credential ${secret}`));

    const response = await apiRequest("/api/connections");
    const result = await response.text();

    expect(response.status).toBe(500);
    expect(result).not.toContain(secret);
    expect(logError).toHaveBeenCalledWith("CONDUIT request failed.");
    expect(JSON.stringify(logError.mock.calls)).not.toContain(secret);
  });
});

describe("chat generation options", () => {
  it("rejects unsupported generation ranges", async () => {
    const response = await apiRequest("/api/chat/stream", {
      method: "POST",
      body: {
        connectionId: "connection",
        model: "gpt-test",
        messages: [{ role: "user", content: "hello" }],
        temperature: 2.1,
      },
      origin: allowedOrigin,
    });

    expect(response.status).toBe(400);
    expect(await response.text()).toContain("Generation options");
  });

  it("forwards valid generation settings and provider usage in the SSE stream", async () => {
    readStore.mockResolvedValue({
      connections: [{
        id: "connection",
        provider: "openai",
        models: ["gpt-test"],
        encryptedKey: { iv: "", tag: "", ciphertext: "" },
      }],
      activeId: "connection",
    });
    const providerStream = [
      `data: ${JSON.stringify({ model: "gpt-test", choices: [{ delta: { content: "reply" } }] })}`,
      `data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 4, completion_tokens: 2 } })}`,
      "data: [DONE]",
      "",
    ].join("\n\n");
    const fetchMock = vi.fn().mockResolvedValue(new Response(providerStream, {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await apiRequest("/api/chat/stream", {
      method: "POST",
      body: {
        connectionId: "connection",
        model: "gpt-test",
        messages: [{ role: "user", content: "hello" }],
        systemPrompt: "Be concise",
        temperature: 0.6,
        maxTokens: 140,
      },
      origin: allowedOrigin,
    });
    const result = await response.text();
    const providerRequest = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const providerBody = JSON.parse(String(providerRequest.body));

    expect(response.status).toBe(200);
    expect(result).toContain('"delta":"reply"');
    expect(result).toContain('"usage":{"input":4,"output":2}');
    expect(providerBody).toMatchObject({
      messages: [
        { role: "system", content: "Be concise" },
        { role: "user", content: "hello" },
      ],
      temperature: 0.6,
      max_tokens: 140,
    });
  });
});

describe("provider chat retries", () => {
  const connectOpenAi = () => {
    readStore.mockResolvedValue({
      connections: [{
        id: "connection",
        provider: "openai",
        models: ["gpt-test"],
        encryptedKey: { iv: "", tag: "", ciphertext: "" },
      }],
      activeId: "connection",
    });
  };

  it.each([429, 503])("retries transient HTTP %i failures before streaming starts", async (status) => {
    connectOpenAi();
    const successStream = `data: ${JSON.stringify({ choices: [{ delta: { content: "ready" } }] })}\n\n`;
    const responses = [
      new Response(JSON.stringify({ error: { message: "Temporary outage" } }), { status }),
      new Response(successStream, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      }),
    ];
    const requestTimes: number[] = [];
    const fetchMock = vi.fn().mockImplementation(() => {
      requestTimes.push(Date.now());
      const response = responses.shift();
      if (!response) throw new Error("Unexpected provider retry.");
      return Promise.resolve(response);
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await apiRequest("/api/chat/stream", {
      method: "POST",
      body: {
        connectionId: "connection",
        model: "gpt-test",
        messages: [{ role: "user", content: "hello" }],
      },
      origin: allowedOrigin,
    });
    const result = await response.text();

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(requestTimes[1] - requestTimes[0]).toBeGreaterThanOrEqual(200);
    expect(result).toContain('"delta":"ready"');
  });

  it("does not retry after the first upstream bytes have arrived", async () => {
    connectOpenAi();
    const firstEvent = `data: ${JSON.stringify({ choices: [{ delta: { content: "partial" } }] })}\n\n`;
    let sent = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (!sent) {
          sent = true;
          controller.enqueue(new TextEncoder().encode(firstEvent));
        } else {
          controller.error(new Error("connection interrupted"));
        }
      },
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response(stream, {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await apiRequest("/api/chat/stream", {
      method: "POST",
      body: {
        connectionId: "connection",
        model: "gpt-test",
        messages: [{ role: "user", content: "hello" }],
      },
      origin: allowedOrigin,
    });
    const result = await response.text();

    expect(result).toContain('"delta":"partial"');
    expect(result).toContain('"error"');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("saved connection status", () => {
  it("records invalid credentials and returns validation timestamps without exposing secrets", async () => {
    const addedAt = "2026-01-02T03:04:05.000Z";
    persistedStore.connections = [{
      id: "connection",
      provider: "openai",
      providerName: "OpenAI",
      keyHint: "********1234",
      models: ["gpt-test"],
      addedAt,
      encryptedKey: { iv: "", tag: "", ciphertext: "" },
    }];
    persistedStore.activeId = "connection";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ error: { message: "Invalid API key." } }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    )));

    const response = await apiRequest("/api/chat/stream", {
      method: "POST",
      body: {
        connectionId: "connection",
        model: "gpt-test",
        messages: [{ role: "user", content: "hello" }],
      },
      origin: allowedOrigin,
    });
    const failure = await response.text();
    const connectionResponse = await apiRequest("/api/connections");
    const connectionData = await connectionResponse.json() as {
      connections: Array<{ status: string; lastValidatedAt: string; encryptedKey?: unknown }>;
    };

    expect(response.status).toBe(401);
    expect(failure).not.toContain(secret);
    expect(connectionData.connections[0]).toMatchObject({ status: "invalid", lastValidatedAt: addedAt });
    expect(connectionData.connections[0]).not.toHaveProperty("encryptedKey");
  });
});

describe("connection mutation concurrency", () => {
  const stubModelValidation = () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(new Response(
      JSON.stringify({ data: [{ id: "gpt-test" }] }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ))));
  };

  it("prevents concurrent validation IDs for the same key from creating duplicates", async () => {
    stubModelValidation();
    const validationIds = await Promise.all([validateApiKey(secret), validateApiKey(secret)]);
    const responses = await Promise.all(validationIds.map((validationId) =>
      apiRequest("/api/connections", {
        method: "POST",
        body: { validationId },
        origin: allowedOrigin,
      }),
    ));

    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    expect(persistedStore.connections).toHaveLength(1);
  });

  it("allows a validation ID to be consumed only once during concurrent adds", async () => {
    stubModelValidation();
    const validationId = await validateApiKey("sk-single-use-key");
    readStore.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return structuredClone(persistedStore);
    });
    const responses = await Promise.all([validationId, validationId].map((id) =>
      apiRequest("/api/connections", {
        method: "POST",
        body: { validationId: id },
        origin: allowedOrigin,
      }),
    ));

    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    expect(persistedStore.connections).toHaveLength(1);
    expect(await responses.find((response) => response.status === 409)?.text()).toContain("VALIDATION_IN_USE");
  });

  it("enforces the ten-connection cap when different keys are added concurrently", async () => {
    persistedStore.connections = Array.from({ length: 9 }, (_, index) => ({
      id: `existing-${index}`,
      provider: "openai",
      providerName: "OpenAI",
      keyHint: "********",
      models: ["gpt-test"],
      addedAt: "2025-01-01T00:00:00.000Z",
      encryptedKey: { iv: "", tag: "", ciphertext: `existing-key-${index}` },
    }));
    decryptApiKey.mockImplementation((encrypted: StoredConnection["encryptedKey"]) => encrypted.ciphertext);
    stubModelValidation();
    const validationIds = await Promise.all([
      validateApiKey("sk-new-cap-key-a"),
      validateApiKey("sk-new-cap-key-b"),
    ]);
    const responses = await Promise.all(validationIds.map((validationId) =>
      apiRequest("/api/connections", {
        method: "POST",
        body: { validationId },
        origin: allowedOrigin,
      }),
    ));

    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    expect(persistedStore.connections).toHaveLength(10);
  });

  it("prevents replacing a connection with a key already saved elsewhere", async () => {
    persistedStore.connections = ["first", "second"].map((id) => ({
      id,
      provider: "openai",
      providerName: "OpenAI",
      keyHint: "********",
      models: ["gpt-test"],
      addedAt: "2025-01-01T00:00:00.000Z",
      encryptedKey: { iv: "", tag: "", ciphertext: id === "second" ? "sk-existing-replacement-key" : "sk-original-key" },
    }));
    persistedStore.activeId = "first";
    decryptApiKey.mockImplementation((encrypted: StoredConnection["encryptedKey"]) => encrypted.ciphertext);
    stubModelValidation();
    const validationId = await validateApiKey("sk-existing-replacement-key");

    const response = await apiRequest("/api/connections/first", {
      method: "PUT",
      body: { validationId },
      origin: allowedOrigin,
    });

    expect(response.status).toBe(409);
    expect(await response.text()).toContain("already saved");
    expect(persistedStore.connections[0].encryptedKey.ciphertext).toBe("sk-original-key");
  });

  it("rechecks validation expiry when a concurrent mutation waits in the store queue", async () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(10_000);
    stubModelValidation();
    const validationId = await validateApiKey(secret);
    let startRead!: () => void;
    let finishRead!: () => void;
    const readStarted = new Promise<void>((resolve) => {
      startRead = resolve;
    });
    const waitForRead = new Promise<void>((resolve) => {
      finishRead = resolve;
    });
    readStore.mockImplementationOnce(async () => {
      startRead();
      await waitForRead;
      return structuredClone(persistedStore);
    });
    const blockingMutation = apiRequest("/api/connections/active", {
      method: "PUT",
      body: { id: null },
      origin: allowedOrigin,
    });
    await readStarted;
    const pendingAdd = apiRequest("/api/connections", {
      method: "POST",
      body: { validationId },
      origin: allowedOrigin,
    });
    await new Promise((resolve) => setTimeout(resolve, 25));
    clock.mockReturnValue(10_000 + 30 * 60_000 + 1);
    finishRead();
    const [mutationResponse, addResponse] = await Promise.all([blockingMutation, pendingAdd]);

    expect(mutationResponse.status).toBe(200);
    expect(addResponse.status).toBe(400);
    expect(await addResponse.text()).toContain("VALIDATION_EXPIRED");
    clock.mockRestore();
  });
});

describe("API rate limits", () => {
  it("limits validation and chat stream requests", async () => {
    const validationResponses = await Promise.all(
      Array.from({ length: 12 }, () =>
        apiRequest("/api/validate", {
          method: "POST",
          body: { apiKey: "short" },
          origin: allowedOrigin,
        }),
      ),
    );
    const chatResponses = await Promise.all(
      Array.from({ length: 32 }, () =>
        apiRequest("/api/chat/stream", {
          method: "POST",
          body: {
            connectionId: "missing",
            model: "model",
            messages: [{ role: "user", content: "hello" }],
          },
          origin: allowedOrigin,
        }),
      ),
    );

    expect(validationResponses.some((response) => response.status === 429)).toBe(true);
    expect(chatResponses.some((response) => response.status === 429)).toBe(true);
  });
});
