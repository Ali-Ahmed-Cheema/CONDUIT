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
