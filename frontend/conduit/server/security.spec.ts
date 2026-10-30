import { createServer, request as sendHttpRequest } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { decryptApiKey, readStore, writeStore } = vi.hoisted(() => ({
  decryptApiKey: vi.fn(),
  readStore: vi.fn(),
  writeStore: vi.fn(),
}));

vi.mock("./keyStore", () => ({
  decryptApiKey,
  encryptApiKey: vi.fn(() => ({ iv: "", tag: "", ciphertext: "" })),
  readStore,
  validateEncryptionKey: vi.fn(),
  writeStore,
}));

import { app } from "./index";

const allowedOrigin = "http://localhost:5173";
const secret = "sk-test-secret-1234";
let server: ReturnType<typeof createServer>;
let baseUrl: string;

function apiRequest(
  path: string,
  options: { method?: string; body?: unknown; origin?: string; host?: string } = {},
): Promise<Response> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.origin !== undefined) headers.Origin = options.origin;
  if (options.host !== undefined) headers.Host = options.host;
  const url = new URL(`${baseUrl}${path}`);
  return new Promise((resolve, reject) => {
    const request = sendHttpRequest({
      hostname: url.hostname,
      port: url.port,
      path: `${url.pathname}${url.search}`,
      method: options.method ?? "GET",
      headers,
    }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("end", () => {
        const responseHeaders = new Headers();
        for (const [name, value] of Object.entries(response.headers)) {
          if (value) responseHeaders.set(name, Array.isArray(value) ? value.join(", ") : value);
        }
        resolve(new Response(Buffer.concat(chunks), {
          status: response.statusCode ?? 500,
          headers: responseHeaders,
        }));
      });
    });
    request.on("error", reject);
    if (options.body !== undefined) request.write(JSON.stringify(options.body));
    request.end();
  });
}

beforeAll(async () => {
  server = createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address() as AddressInfo;
      baseUrl = `http://127.0.0.1:${address.port}`;
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

beforeEach(() => {
  vi.restoreAllMocks();
  readStore.mockResolvedValue({ connections: [], activeId: null });
  writeStore.mockResolvedValue(undefined);
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
