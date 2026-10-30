import { afterEach, describe, expect, it, vi } from "vitest";
import { streamChat } from "../api";

describe("chat streaming client", () => {
  afterEach(() => vi.unstubAllGlobals());

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
