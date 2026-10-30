import { afterEach, describe, expect, it, vi } from "vitest";
import {
  findProvider,
  getProviderHint,
  isCredentialRejection,
  providerFailureMessage,
  providerResponseError,
  ProviderRequestError,
} from "./providers";

describe("provider error details", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("includes the provider's 404 explanation", async () => {
    const response = new Response(
      JSON.stringify({ error: { message: "model is not available for this API key" } }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );

    const error = await providerResponseError(response);

    expect(error.status).toBe(404);
    expect(providerFailureMessage(error)).toBe(
      "The provider endpoint or requested model was not found. Provider details: model is not available for this API key",
    );
  });

  it("redacts a credential echoed by the provider", async () => {
    const response = new Response(
      JSON.stringify({ error: { message: "credential sk-test-secret was rejected" } }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );

    const error = await providerResponseError(response);

    expect(providerFailureMessage(error)).not.toContain("sk-test-secret");
    expect(providerFailureMessage(error)).toContain("[REDACTED]");
  });

  it("redacts a Hugging Face token echoed by the provider", async () => {
    const response = new Response(
      JSON.stringify({ error: { message: "credential hf_test_secret_token was rejected" } }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );

    const error = await providerResponseError(response);

    expect(providerFailureMessage(error)).not.toContain("hf_test_secret_token");
    expect(providerFailureMessage(error)).toContain("[REDACTED]");
  });

  it("does not repeat a generic provider error as detail", async () => {
    const response = new Response("not JSON", { status: 404 });

    const error = await providerResponseError(response);

    expect(providerFailureMessage(error)).toBe("The provider endpoint or requested model was not found.");
  });

  it("continues provider probing for explicit invalid-key responses including Mistral's 400", () => {
    expect(isCredentialRejection(new ProviderRequestError(
      "API key not valid. Please pass a valid API key.",
      400,
    ))).toBe(true);
    expect(isCredentialRejection(new ProviderRequestError("Unauthorized", 401))).toBe(true);
    expect(isCredentialRejection(new ProviderRequestError("Insufficient permissions", 403))).toBe(false);
    expect(isCredentialRejection(new ProviderRequestError("Rate limit exceeded", 429))).toBe(false);
    expect(isCredentialRejection(new ProviderRequestError("Model not found", 404))).toBe(false);
  });
});

describe("Hugging Face provider", () => {
  it("recognizes hf_ tokens and validates them through the Inference Providers model API", async () => {
    const key = "hf_test_token_with_sufficient_length";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        data: [
          { id: "example/Example-Chat", pipeline_tag: "chat-completion" },
          { id: "example/Example-Embed", pipeline_tag: "feature-extraction" },
        ],
      }), { status: 200, headers: { "Content-Type": "application/json" } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const providerHint = getProviderHint(key);
    expect(providerHint?.id).toBe("huggingface");
    const provider = findProvider("huggingface");
    if (!provider) throw new Error("The Hugging Face provider is not registered.");
    const models = await provider.listModels(key, new AbortController().signal);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://router.huggingface.co/v1/models",
      expect.objectContaining({
        headers: { Authorization: `Bearer ${key}` },
      }),
    );
    expect(models).toEqual([
      { id: "example/Example-Chat", chat: true },
      { id: "example/Example-Embed", chat: false },
    ]);
  });

  it("uses Hugging Face's OpenAI-compatible streaming chat endpoint", async () => {
    const key = "hf_test_token_with_sufficient_length";
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const provider = findProvider("huggingface");
    if (!provider) throw new Error("The Hugging Face provider is not registered.");

    await provider.chat(key, "example/Example-Chat", [{ role: "user", content: "Hello" }], new AbortController().signal);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://router.huggingface.co/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "example/Example-Chat",
          messages: [{ role: "user", content: "Hello" }],
          stream: true,
        }),
      }),
    );
  });
});

describe("provider registry", () => {
  it.each([
    ["sk-openai-test-key", "openai"],
    ["sk-ant-test-key", "anthropic"],
    ["AIza-test-key", "google"],
    ["gsk_test-key", "groq"],
    ["sk-or-test-key", "openrouter"],
    ["hf_test-key", "huggingface"],
  ] as const)("identifies %s as %s without broad-prefix collisions", (key, providerId) => {
    expect(getProviderHint(key)?.id).toBe(providerId);
  });
});

describe("provider generation options and token usage", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("passes system prompt and generation options to OpenAI-compatible requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const provider = findProvider("openai");
    if (!provider) throw new Error("OpenAI provider not registered.");

    await provider.chat(
      "sk-test-key",
      "gpt-test",
      [{ role: "user", content: "Hello" }],
      new AbortController().signal,
      { systemPrompt: "Be concise", temperature: 0.4, maxTokens: 120 },
    );

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(request.body))).toEqual({
      model: "gpt-test",
      messages: [
        { role: "system", content: "Be concise" },
        { role: "user", content: "Hello" },
      ],
      stream: true,
      stream_options: { include_usage: true },
      temperature: 0.4,
      max_tokens: 120,
    });
    expect(provider.extractUsage({ usage: { prompt_tokens: 8, completion_tokens: 5 } })).toEqual({
      input: 8,
      output: 5,
    });
  });

  it("maps Anthropic generation options and incremental stream usage", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const provider = findProvider("anthropic");
    if (!provider) throw new Error("Anthropic provider not registered.");

    await provider.chat(
      "sk-ant-test-key",
      "claude-test",
      [{ role: "user", content: "Hello" }],
      new AbortController().signal,
      { systemPrompt: "Be concise", temperature: 0.2, maxTokens: 90 },
    );

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({
      system: "Be concise",
      temperature: 0.2,
      max_tokens: 90,
      messages: [{ role: "user", content: "Hello" }],
    });
    expect(provider.extractUsage({ type: "message_start", message: { usage: { input_tokens: 8 } } })).toEqual({
      input: 8,
      output: undefined,
    });
    expect(provider.extractUsage({ type: "message_delta", usage: { output_tokens: 5 } })).toEqual({
      input: undefined,
      output: 5,
    });
  });

  it("maps Google generation options and usage metadata", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const provider = findProvider("google");
    if (!provider) throw new Error("Google provider not registered.");

    await provider.chat(
      "AIza-test-key",
      "gemini-test",
      [{ role: "user", content: "Hello" }],
      new AbortController().signal,
      { systemPrompt: "Be concise", temperature: 0.3, maxTokens: 70 },
    );

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(request.body))).toEqual({
      contents: [{ role: "user", parts: [{ text: "Hello" }] }],
      systemInstruction: { parts: [{ text: "Be concise" }] },
      generationConfig: { temperature: 0.3, maxOutputTokens: 70 },
    });
    expect(provider.extractUsage({ usageMetadata: { promptTokenCount: 8, candidatesTokenCount: 5 } })).toEqual({
      input: 8,
      output: 5,
    });
  });
});
