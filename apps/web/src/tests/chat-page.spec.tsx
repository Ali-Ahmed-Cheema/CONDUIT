// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getConnections: vi.fn(),
  streamChat: vi.fn(),
  createOcrWorker: vi.fn(),
}));

vi.mock("tesseract.js", () => ({
  createWorker: mocks.createOcrWorker,
}));

vi.mock("../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api")>();
  return {
    ...actual,
    getConnections: mocks.getConnections,
    streamChat: mocks.streamChat,
  };
});

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getVirtualItems: () => Array.from({ length: count }, (_, index) => ({
      index,
      key: index,
      start: index * 180,
    })),
    getTotalSize: () => count * 180,
    measureElement: vi.fn(),
    scrollToIndex: vi.fn(),
  }),
}));

import { ChatPage } from "../pages/Chat";
import { useAppStore, type ChatConversation } from "../store";
import type { ChatAlternative, ChatComparisonRequest, Connection, ConnectionsResponse, TokenUsage } from "../types";

const connection: Connection = {
  id: "connection",
  provider: "openai",
  providerName: "OpenAI",
  keyHint: "********1234",
  models: ["gpt-test"],
  addedAt: "2026-01-01T00:00:00.000Z",
  status: "valid",
  lastValidatedAt: "2026-01-01T00:00:00.000Z",
};
const connectionsResult: ConnectionsResponse = { connections: [connection], activeId: connection.id };

function existingConversation(): ChatConversation {
  return {
    id: "conversation",
    title: "Test conversation",
    createdAt: 1,
    updatedAt: 1,
    connectionId: connection.id,
    provider: connection.provider,
    model: "gpt-test",
    messages: [
      { id: "user-1", role: "user", content: "Original question", ts: 1, model: "gpt-test" },
      { id: "assistant-1", role: "assistant", content: "Previous answer", ts: 2, model: "gpt-test" },
    ],
  };
}

function renderChat() {
  return render(<MemoryRouter><ChatPage /></MemoryRouter>);
}

function setupStore(conversations: ChatConversation[] = []) {
  useAppStore.setState({
    unlocked: true,
    dataKey: {} as CryptoKey,
    connections: [connection],
    activeConnectionId: connection.id,
    activeModel: "gpt-test",
    conversations,
    activeConversationId: conversations[0]?.id ?? null,
    soundOn: false,
    vaultError: null,
  });
}

beforeEach(() => {
  mocks.getConnections.mockReset().mockResolvedValue(connectionsResult);
  mocks.createOcrWorker.mockReset().mockResolvedValue({
    recognize: vi.fn().mockResolvedValue({ data: { text: "Recognized image text" } }),
    terminate: vi.fn().mockResolvedValue(undefined),
  });
  mocks.streamChat.mockReset().mockImplementation(async (
    _connectionId: string,
    _model: string,
    _messages: unknown[],
    onDelta: (delta: string) => void,
    onModel?: (model: string) => void,
    _signal?: AbortSignal,
    _options?: unknown,
    onUsage?: (usage: TokenUsage) => void,
    _onAlternatives?: (alternatives: ChatAlternative[]) => void,
    _comparison?: ChatComparisonRequest,
    _onComparisonNotice?: (notice: string) => void,
  ) => {
    onDelta("Mocked response");
    onModel?.("gpt-test");
    onUsage?.({ input: 4, output: 2 });
  });
  setupStore();
});

afterEach(() => {
  cleanup();
});

describe("chat page", () => {
  it("automatically compares both configured APIs when exactly two connections exist", async () => {
    const gemini: Connection = {
      ...connection,
      id: "gemini",
      provider: "google",
      providerName: "Gemini",
      models: ["gemini-model"],
    };
    mocks.getConnections.mockResolvedValue({
      connections: [connection, gemini],
      activeId: connection.id,
    });
    const user = userEvent.setup();
    renderChat();
    await screen.findByText(/OpenAI · gpt-test/);

    expect(screen.getByText(/Automatic comparison is on/)).toBeTruthy();
    expect(screen.queryByRole("checkbox", { name: "Compare multiple API connections" })).toBeNull();
    await user.selectOptions(screen.getByRole("combobox", { name: "Comparison judge" }), "system");
    await user.type(screen.getByRole("textbox", { name: "Message" }), "Hello both");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText("Mocked response")).toBeTruthy();
    expect(mocks.streamChat.mock.calls[0]?.[9]).toEqual({
      mode: "automatic",
      judgeMode: "system",
      candidates: [
        { connectionId: connection.id, model: "gpt-test" },
        { connectionId: "gemini", model: "gemini-model" },
      ],
    });
  });

  it("sends a message and stores the streamed model and usage", async () => {
    const user = userEvent.setup();
    renderChat();
    await screen.findByText(/OpenAI · gpt-test/);

    await user.type(screen.getByRole("textbox", { name: "Message" }), "Hello provider");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText("Mocked response")).toBeTruthy();
    const conversation = useAppStore.getState().conversations[0];
    expect(conversation?.messages.map((message) => message.content)).toEqual(["Hello provider", "Mocked response"]);
    expect(conversation?.messages[1]).toMatchObject({
      model: "gpt-test",
      usage: { input: 4, output: 2 },
    });
    expect(screen.getByText("Response complete")).toBeTruthy();
  });

  it("translates a response into a selected language and can restore the original", async () => {
    const user = userEvent.setup();
    setupStore([existingConversation()]);
    renderChat();
    await screen.findByText("Previous answer");

    await user.click(screen.getByRole("button", { name: "Translate response" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Translation language" }), "French");
    await user.click(screen.getByRole("button", { name: "Translate" }));

    expect(await screen.findByText("Mocked response")).toBeTruthy();
    expect(mocks.streamChat).toHaveBeenCalledTimes(1);
    expect(mocks.streamChat.mock.calls[0]?.[0]).toBe(connection.id);
    expect(mocks.streamChat.mock.calls[0]?.[1]).toBe("gpt-test");
    expect(mocks.streamChat.mock.calls[0]?.[2]).toEqual([{ role: "user", content: "Previous answer" }]);
    expect(mocks.streamChat.mock.calls[0]?.[6]).toMatchObject({
      systemPrompt: expect.stringContaining("French"),
    });

    await user.click(screen.getByRole("button", { name: "Undo translation" }));
    expect(await screen.findByText("Previous answer")).toBeTruthy();
    expect(screen.queryByText("Mocked response")).toBeNull();
  });

  it("compares selected API responses with the active connection and shows the originals", async () => {
    const judge: Connection = {
      ...connection,
      id: "judge",
      provider: "groq",
      providerName: "Groq",
      keyHint: "********0003",
      models: ["groq-model"],
    };
    const openai: Connection = {
      ...connection,
      id: "openai",
      keyHint: "********0001",
      models: ["gpt-one"],
    };
    const gemini: Connection = {
      ...connection,
      id: "gemini",
      provider: "google",
      providerName: "Gemini",
      keyHint: "********0002",
      models: ["gemini-model"],
    };
    mocks.getConnections.mockResolvedValue({
      connections: [openai, gemini, judge],
      activeId: judge.id,
    });
    mocks.streamChat.mockImplementationOnce(async (
      _connectionId: string,
      _model: string,
      _messages: unknown[],
      onDelta: (delta: string) => void,
      onModel?: (model: string) => void,
      _signal?: AbortSignal,
      _options?: unknown,
      onUsage?: (usage: TokenUsage) => void,
      onAlternatives?: (alternatives: ChatAlternative[]) => void,
      _comparison?: ChatComparisonRequest,
      onComparisonNotice?: (notice: string) => void,
    ) => {
      onAlternatives?.([
        { providerName: "OpenAI", model: "gpt-one", content: "OpenAI response" },
        { providerName: "Gemini", model: "gemini-model", content: "Gemini response" },
      ]);
      onComparisonNotice?.("One respondent was unavailable.");
      onDelta("Groq synthesis");
      onModel?.("groq-model");
      onUsage?.({ input: 6, output: 3 });
    });
    const user = userEvent.setup();
    renderChat();
    await screen.findByText(/Groq · groq-model/);
    await user.click(screen.getByText("More options"));
    await user.click(screen.getByRole("checkbox", { name: "Enable multi-provider comparison" }));
    await user.type(screen.getByRole("textbox", { name: "Message" }), "Hello everyone");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText("Groq synthesis")).toBeTruthy();
    expect(screen.getByText("One respondent was unavailable.")).toBeTruthy();
    expect(mocks.streamChat.mock.calls[0]?.[0]).toBe("judge");
    expect(mocks.streamChat.mock.calls[0]?.[1]).toBe("groq-model");
    expect(mocks.streamChat.mock.calls[0]?.[9]).toEqual({
      mode: "custom",
      judgeMode: "provider",
      candidates: [
        { connectionId: "openai", model: "gpt-one" },
        { connectionId: "gemini", model: "gemini-model" },
      ],
    });
    await user.click(screen.getByText("View 2 provider responses"));
    await user.click(screen.getByText("OpenAI · gpt-one"));
    expect(screen.getByText("OpenAI response")).toBeTruthy();
    await user.click(screen.getByText("Gemini · gemini-model"));
    expect(screen.getByText("Gemini response")).toBeTruthy();

    const openaiSection = screen.getByText("OpenAI response").closest("section");
    if (!openaiSection) throw new Error("OpenAI response section was not rendered.");
    await user.click(within(openaiSection).getByRole("button", { name: "Translate response" }));
    await user.click(screen.getByRole("button", { name: "Translate" }));
    expect(await screen.findByText("Mocked response")).toBeTruthy();
    expect(mocks.streamChat.mock.calls[1]?.[2]).toEqual([{ role: "user", content: "OpenAI response" }]);
    await user.click(screen.getByRole("button", { name: "Undo translation" }));
    expect(screen.getByText("OpenAI response")).toBeTruthy();
  });

  it("attaches any number of text and binary files and sends them as text", async () => {
    const user = userEvent.setup();
    const { container } = renderChat();
    await screen.findByText(/OpenAI · gpt-test/);

    await user.click(screen.getByRole("button", { name: "Attach" }));
    expect(await screen.findByRole("button", { name: "Choose files" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Choose folder" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Choose files" }));
    expect(screen.queryByRole("button", { name: "Choose files" })).toBeNull();
    const contents = Array.from({ length: 20 }, (_, index) => `Notes ${index}`);
    const textFiles = contents.map((content, index) => new File(
      [content],
      index === 0 ? "Pasted text #1.txt" : `notes-${index}.txt`,
      { type: "text/plain" },
    ));
    const binaryFile = new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00])], "archive.zip", {
      type: "application/zip",
    });
    const files = [...textFiles, binaryFile];
    const textContent = contents.map((content, index) => {
      const name = index === 0 ? "Pasted text #1.txt" : `notes-${index}.txt`;
      return `\n\n--- Attached file: ${name} ---\n${content}\n--- End attached file ---`;
    }).join("");
    const expectedContent = [
      `Summarize this${textContent}`,
      "\n\n--- Attached file: archive.zip ---",
      "\nBinary file converted to base64 text.",
      "\nOriginal file: archive.zip",
      "\nMIME type: application/zip",
      "\nEncoding: base64",
      "\n\nUEsDBAA=",
      "\n--- End attached file ---",
    ].join("");
    await user.upload(container.querySelector<HTMLInputElement>('input[aria-label="Choose files to attach"]')!, files);
    expect(await screen.findByText("Pasted text #1.txt")).toBeTruthy();
    expect(screen.getByText("archive.zip")).toBeTruthy();
    await user.type(screen.getByRole("textbox", { name: "Message" }), "Summarize this");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText("Mocked response")).toBeTruthy();
    expect(mocks.streamChat.mock.calls[0]?.[2]).toEqual([{ role: "user", content: expectedContent }]);
    expect(useAppStore.getState().conversations[0]?.messages[0]?.attachments).toHaveLength(21);
    expect(useAppStore.getState().conversations[0]?.messages[0]?.attachments?.[0]).toMatchObject({
      name: "Pasted text #1.txt",
      content: "Notes 0",
    });
    expect(useAppStore.getState().conversations[0]?.messages[0]?.attachments?.[20]).toMatchObject({
      name: "archive.zip",
      content: expect.stringContaining("UEsDBAA="),
    });
    await user.click(await screen.findByRole("button", { name: "Regenerate" }));
    expect(await screen.findByText("Mocked response")).toBeTruthy();
    expect(mocks.streamChat).toHaveBeenCalledTimes(2);
    expect(mocks.streamChat.mock.calls[1]?.[2]).toEqual([{ role: "user", content: expectedContent }]);
  });

  it("extracts OCR text from an attached image before sending it to the API", async () => {
    const user = userEvent.setup();
    const { container } = renderChat();
    await screen.findByText(/OpenAI · gpt-test/);

    await user.click(screen.getByRole("button", { name: "Attach" }));
    await user.click(await screen.findByRole("button", { name: "Choose files" }));
    const image = new File(["photo data"], "receipt.jpg", { type: "image/jpeg" });
    await user.upload(
      container.querySelector<HTMLInputElement>('input[aria-label="Choose files to attach"]')!,
      image,
    );

    expect(await screen.findByText("OCR text")).toBeTruthy();
    expect(mocks.createOcrWorker).toHaveBeenCalledWith(
      "eng",
      undefined,
      expect.objectContaining({
        workerPath: "/ocr-assets/worker.min.js",
        corePath: "/ocr-assets",
        workerBlobURL: false,
      }),
    );
    await user.type(screen.getByRole("textbox", { name: "Message" }), "Read this photo");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText("Mocked response")).toBeTruthy();
    expect(mocks.streamChat.mock.calls[0]?.[2]).toEqual([{
      role: "user",
      content: [
        "Read this photo",
        "",
        "--- Attached file: receipt.jpg ---",
        "OCR text (English):",
        "Recognized image text",
        "--- End attached file ---",
      ].join("\n"),
    }]);
    expect(useAppStore.getState().conversations[0]?.messages[0]?.attachments).toEqual([
      expect.objectContaining({
        name: "receipt.jpg",
        type: "image/jpeg",
        content: "OCR text (English):\nRecognized image text",
      }),
    ]);
  });

  it("serializes a selected folder as text for the chat API", async () => {
    const user = userEvent.setup();
    const { container } = renderChat();
    await screen.findByText(/OpenAI · gpt-test/);

    const sourceFile = new File(["export const answer = 42;"], "index.ts", { type: "text/plain" });
    Object.defineProperty(sourceFile, "webkitRelativePath", { value: "project/src/index.ts" });
    const readmeFile = new File(["Project notes"], "README.md", { type: "text/markdown" });
    Object.defineProperty(readmeFile, "webkitRelativePath", { value: "project/README.md" });
    const imageFile = new File(["image data"], "logo.png", { type: "image/png" });
    Object.defineProperty(imageFile, "webkitRelativePath", { value: "project/assets/logo.png" });

    await user.click(screen.getByRole("button", { name: "Attach" }));
    expect(await screen.findByRole("button", { name: "Choose folder" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Choose folder" }));
    const folderInput = container.querySelector<HTMLInputElement>('input[aria-label="Choose folder to attach"]')!;
    await user.upload(folderInput, [sourceFile, readmeFile, imageFile]);

    expect(await screen.findByText("project.txt")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText("Mocked response")).toBeTruthy();
    expect(mocks.streamChat.mock.calls[0]?.[2]).toEqual([{
      role: "user",
      content: [
        "Please review the attached files.",
        "",
        "--- Attached file: project.txt ---",
        "--- assets/logo.png ---",
        "OCR text (English):",
        "Recognized image text",
        "--- End assets/logo.png ---",
        "",
        "--- README.md ---",
        "Project notes",
        "--- End README.md ---",
        "",
        "--- src/index.ts ---",
        "export const answer = 42;",
        "--- End src/index.ts ---",
        "--- End attached file ---",
      ].join("\n"),
    }]);
    expect(useAppStore.getState().conversations[0]?.messages[0]?.attachments).toEqual([
      expect.objectContaining({
        name: "project.txt",
        type: "text/plain",
        content: [
          "--- assets/logo.png ---",
          "OCR text (English):",
          "Recognized image text",
          "--- End assets/logo.png ---",
          "",
          "--- README.md ---",
          "Project notes",
          "--- End README.md ---",
          "",
          "--- src/index.ts ---",
          "export const answer = 42;",
          "--- End src/index.ts ---",
        ].join("\n"),
      }),
    ]);
  });

  it("reports when converted attachment text exceeds the API limit instead of truncating it", async () => {
    const user = userEvent.setup();
    const { container } = renderChat();
    await screen.findByText(/OpenAI · gpt-test/);

    const oversizedFile = new File(["x".repeat(180_001)], "large.txt", { type: "text/plain" });
    await user.upload(
      container.querySelector<HTMLInputElement>('input[aria-label="Choose files to attach"]')!,
      oversizedFile,
    );

    expect((await screen.findByRole("alert")).textContent).toContain("exceeds the supported chat text size");
    expect(mocks.streamChat).not.toHaveBeenCalled();
  });

  it("stops an active stream and offers retry after a provider failure", async () => {
    mocks.streamChat.mockImplementation((
      _connectionId: string,
      _model: string,
      _messages: unknown[],
      onDelta: (delta: string) => void,
      _onModel?: (model: string) => void,
      signal?: AbortSignal,
    ) => new Promise<void>((resolve, reject) => {
      if (mocks.streamChat.mock.calls.length === 1) {
        signal?.addEventListener("abort", () => {
          const error = new Error("Stopped");
          error.name = "AbortError";
          reject(error);
        }, { once: true });
        return;
      }
      onDelta("Recovered response");
      resolve();
    }));
    const user = userEvent.setup();
    renderChat();
    await screen.findByText(/OpenAI · gpt-test/);
    await user.type(screen.getByRole("textbox", { name: "Message" }), "Start a response");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await user.click(await screen.findByRole("button", { name: "Stop response generation" }));

    expect(await screen.findByText("Generation stopped")).toBeTruthy();
    expect(mocks.streamChat).toHaveBeenCalledOnce();

    useAppStore.setState({ conversations: [], activeConversationId: null });
    mocks.streamChat.mockRejectedValueOnce(new Error("Provider failed."));
    await user.type(screen.getByRole("textbox", { name: "Message" }), "Retry this");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    await user.click(await screen.findByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Recovered response")).toBeTruthy();
  });

  it("regenerates responses and edits then resends user messages", async () => {
    const user = userEvent.setup();
    setupStore([existingConversation()]);
    renderChat();
    await screen.findByText(/OpenAI · gpt-test/);

    await user.click(await screen.findByRole("button", { name: "Regenerate" }));
    expect(await screen.findByText("Mocked response")).toBeTruthy();

    const userMessage = screen.getByText("Original question").closest("article");
    expect(userMessage).not.toBeNull();
    await user.click(within(userMessage as HTMLElement).getByRole("button", { name: "Edit and resend" }));
    const edit = screen.getByRole("textbox", { name: "Edit message" });
    await user.clear(edit);
    await user.type(edit, "Updated question");
    await user.click(screen.getByRole("button", { name: "Save and resend" }));

    expect(await screen.findByText("Updated question")).toBeTruthy();
    expect(useAppStore.getState().conversations[0]?.messages.map((message) => message.content)).toEqual([
      "Updated question",
      "Mocked response",
    ]);
  });
});
