import { afterEach, describe, expect, it, vi } from "vitest";
import { getConnections, streamChat, validateKey } from "../api";

describe("chat streaming client", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends the selected environment with API-key validation", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      validationId: "validation",
      provider: "openai",
      providerName: "OpenAI",
      models: ["gpt-test"],
      chatModels: ["gpt-test"],
    })));
    vi.stubGlobal("fetch", fetchMock);

    await validateKey("sk-test-key", false, "Staging");

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(request.body))).toEqual({
      apiKey: "sk-test-key",
      probeUnknown: false,
      environment: "Staging",
    });
  });

  it("rejects successful responses that violate the shared API schema", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ connections: [{ id: "connection" }], activeId: null }),
      { headers: { "Content-Type": "application/json" } },
    )));

    await expect(getConnections()).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
      status: 200,
    });
  });

  it("forwards generation options and reports streamed content, model, and usage", async () => {
    const stream = [
      `data: ${JSON.stringify({ delta: "Hello" })}`,
      `data: ${JSON.stringify({ model: "gpt-test" })}`,
      `data: ${JSON.stringify({ usage: { input: 4, output: 2 } })}`,
      `data: ${JSON.stringify({ done: true })}`,
      "",
    ].join("\n\n");
    const fetchMock = vi.fn().mockResolvedValue(new Response(stream));
    vi.stubGlobal("fetch", fetchMock);
    const deltas: string[] = [];
    const models: string[] = [];
    const usages: Array<{ input?: number; output?: number }> = [];

    await streamChat(
      "connection-id",
      "gpt-test",
      [{ role: "user", content: "Hi" }],
      (delta) => deltas.push(delta),
      (model) => models.push(model),
      undefined,
      { systemPrompt: "Be concise", temperature: 0.3, maxTokens: 64 },
      (usage) => usages.push(usage),
    );

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({
      connectionId: "connection-id",
      model: "gpt-test",
      systemPrompt: "Be concise",
      temperature: 0.3,
      maxTokens: 64,
    });
    expect(deltas).toEqual(["Hello"]);
    expect(models).toEqual(["gpt-test"]);
    expect(usages).toEqual([{ input: 4, output: 2 }]);
  });

  it("surfaces provider errors sent after streaming begins", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      `data: ${JSON.stringify({ error: "Provider unavailable" })}\n\n`,
    )));

    await expect(streamChat(
      "connection-id",
      "gpt-test",
      [{ role: "user", content: "Hi" }],
      () => undefined,
    )).rejects.toThrow("Provider unavailable");
  });
});
