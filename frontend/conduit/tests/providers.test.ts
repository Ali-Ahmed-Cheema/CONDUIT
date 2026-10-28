import { describe, expect, it, vi } from "vitest";
import { limitChatHistory } from "../src/api";
import {
  findProvider,
  filterChatModels,
  getChatModels,
  getProviderHint,
  getProviders,
  providerStreamError,
  ProviderRequestError,
  providerFailureMessage,
  redactApiKey,
} from "../server/providers";

describe("provider identification", () => {
  it.each([
    ["sk-ant-example", "anthropic"],
    ["sk-proj-example", "openai"],
    ["sk-or-example", "openrouter"],
    ["AIza-example", "google"],
    ["gsk_example", "groq"],
    ["hf_example", "huggingface"],
  ])("uses a key prefix as a provider hint", (key, provider) => {
    expect(getProviderHint(key)?.id).toBe(provider);
  });

  it("does not claim unknown or placeholder strings identify a provider", () => {
    expect(getProviderHint("unknown-secret")).toBeUndefined();
    expect(getProviderHint("CONDUIT_PLACEHOLDER_KEY_NOT_VALID")).toBeUndefined();
  });

  it("redacts API keys from provider error messages", () => {
    expect(redactApiKey("Provider rejected sk-test-secret; retry sk-test-secret", "sk-test-secret"))
      .toBe("Provider rejected [REDACTED]; retry [REDACTED]");
    expect(providerFailureMessage(new ProviderRequestError("credential sk-test-secret leaked", 400)))
      .not.toContain("sk-test-secret");
  });

  it("normalizes provider stream error events", () => {
    expect(providerStreamError({ error: { message: "model access denied" }, status: 403 })).toMatchObject({
      message: "model access denied",
      status: 403,
    });
    expect(providerStreamError({ error: "upstream failed" })).toMatchObject({
      message: "upstream failed",
      status: 502,
    });
    expect(providerStreamError({ delta: "hello" })).toBeUndefined();
  });

  it("explains rejected keys with actionable next steps", () => {
    const message = providerFailureMessage(new ProviderRequestError("", 401));
    expect(message).toContain("copied correctly");
    expect(message).toContain("still active");
    expect(message).not.toBe("The provider rejected this API key.");
  });

  it("returns providers in the disclosed unknown-key probe order", () => {
    expect(getProviders().map((provider) => provider.id)).toEqual([
      "anthropic",
      "openai",
      "google",
      "groq",
      "openrouter",
      "huggingface",
      "mistral",
    ]);
  });

  it("extracts the provider-reported model when a stream includes it", () => {
    expect(findProvider("openai")?.extractModel({ model: "gpt-4o-2026-01-01" })).toBe("gpt-4o-2026-01-01");
    expect(
      findProvider("anthropic")?.extractModel({
        type: "message_start",
        message: { model: "claude-sonnet-4-20260514" },
      }),
    ).toBe("claude-sonnet-4-20260514");
  });

  it("only selects models classified as conversational", () => {
    expect(
      getChatModels([
        { id: "gpt-4o-mini", chat: true },
        { id: "text-embedding-3-small", chat: false },
        { id: "whisper-1", chat: false },
      ]),
    ).toEqual(["gpt-4o-mini"]);
  });

  it("filters non-chat model names from saved model lists", () => {
    expect(filterChatModels([
      "gemini-2.5-flash",
      "gemini-2.5-flash-image",
      "gemini-2.5-flash-preview-tts",
      "gemini-nano-banana-2.1",
      "text-embedding-3-small",
      "gpt-realtime",
      "gpt-live-1",
      "gpt-5-codex",
      "gpt-3.5-turbo-instruct",
    ])).toEqual(["gemini-2.5-flash"]);
  });

  it("keeps current reasoning models such as o4-mini in chat model lists", () => {
    expect(filterChatModels(["o4-mini", "o4-mini-deep-research", "o3-mini"])).toEqual(["o4-mini", "o3-mini"]);
    expect(filterChatModels(["Kimi-K2-Instruct", "feature-extraction-model"])).toEqual(["Kimi-K2-Instruct"]);
  });

  it("detects Mistral keys through consent-based provider probing", () => {
    expect(getProviderHint("mistral_api_key_with_no_unique_prefix")).toBeUndefined();
    expect(getProviders().some((provider) => provider.id === "mistral")).toBe(true);
  });

  it("supports Mistral model validation and OpenAI-compatible streaming chat", async () => {
    const key = "mistral_api_key_with_no_unique_prefix";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: [
          { id: "mistral-large-latest" },
          { id: "codestral-embed" },
        ],
      }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const provider = findProvider("mistral");
      if (!provider) throw new Error("The Mistral provider is not registered.");

      const models = await provider.listModels(key, new AbortController().signal);
      expect(fetchMock).toHaveBeenNthCalledWith(
        1,
        "https://api.mistral.ai/v1/models",
        expect.objectContaining({ headers: { Authorization: `Bearer ${key}` } }),
      );
      expect(getChatModels(models)).toEqual(["mistral-large-latest"]);

      await provider.chat(key, "mistral-large-latest", [{ role: "user", content: "Hello" }], new AbortController().signal);
      expect(fetchMock).toHaveBeenNthCalledWith(
        2,
        "https://api.mistral.ai/v1/chat/completions",
        expect.objectContaining({
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "mistral-large-latest",
            messages: [{ role: "user", content: "Hello" }],
            stream: true,
          }),
        }),
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("excludes Google image and audio models even when they advertise content generation", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      models: [
        { name: "models/gemini-2.5-flash", supportedGenerationMethods: ["generateContent"] },
        { name: "models/gemini-2.5-flash-image", supportedGenerationMethods: ["generateContent"] },
        { name: "models/gemini-2.5-flash-preview-tts", supportedGenerationMethods: ["generateContent"] },
      ],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const provider = findProvider("google");
      expect(provider).toBeDefined();
      const models = await provider!.listModels("AIza-test-key", new AbortController().signal);
      expect(getChatModels(models)).toEqual(["gemini-2.5-flash"]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("keeps recent conversation history within count and character limits", () => {
    const messages = Array.from({ length: 40 }, (_, index) => ({
      role: index % 2 === 0 ? ("user" as const) : ("assistant" as const),
      content: `message-${index}`,
    }));
    expect(limitChatHistory(messages, 10).map((message) => message.content)).toEqual(
      messages.slice(-10).map((message) => message.content),
    );
    expect(limitChatHistory(messages, 40, 40).map((message) => message.content)).toEqual(
      messages.slice(-4).map((message) => message.content),
    );
  });
});
