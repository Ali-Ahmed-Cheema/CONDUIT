import { afterEach, describe, expect, it, vi } from "vitest";
import { streamChat } from "../src/api";

const encoder = new TextEncoder();

function chunkedStream(value: string) {
  const bytes = encoder.encode(value);
  let index = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index >= bytes.length) {
        controller.close();
        return;
      }
      const next = Math.min(index + 7, bytes.length);
      controller.enqueue(bytes.slice(index, next));
      index = next;
    },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("chat event stream", () => {
  it("parses CRLF events split across arbitrary network chunks", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(chunkedStream([
      'data: {"delta":"Hello"}',
      'data: {"model":"gpt-test"}',
      'data: {"delta":" world"}',
      'data: {"done":true}',
    ].join("\r\n\r\n") + "\r\n\r\n"))));

    const deltas: string[] = [];
    const models: string[] = [];
    await streamChat("connection", "gpt-test", [], (delta) => deltas.push(delta), (model) => models.push(model));

    expect(deltas.join("")).toBe("Hello world");
    expect(models).toEqual(["gpt-test"]);
  });

  it("passes an abort signal to the chat request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      chunkedStream('data: {"delta":"Hello"}\n\ndata: {"done":true}\n\n'),
    ));
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();

    await streamChat("connection", "gpt-test", [], () => undefined, undefined, controller.signal);

    expect(fetchMock.mock.calls[0][1]).toMatchObject({ signal: controller.signal });
  });

  it("rejects the pending request when generation is cancelled", async () => {
    vi.stubGlobal("fetch", vi.fn((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const error = new Error("The operation was aborted.");
          error.name = "AbortError";
          reject(error);
        }, { once: true });
      }),
    ));
    const controller = new AbortController();
    const request = streamChat("connection", "gpt-test", [], () => undefined, undefined, controller.signal);
    controller.abort();

    await expect(request).rejects.toMatchObject({ name: "AbortError" });
  });

  it("surfaces streamed provider errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      chunkedStream('data: {"error":"The provider rejected this API key."}\n\n'),
    )));

    await expect(streamChat("connection", "gpt-test", [], () => undefined))
      .rejects.toThrow("The provider rejected this API key.");
  });

  it("rejects streams that close without a completion event", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      chunkedStream('data: {"delta":"partial"}\n\n'),
    )));

    await expect(streamChat("connection", "gpt-test", [], () => undefined))
      .rejects.toThrow("The response stream ended unexpectedly.");
  });
});
