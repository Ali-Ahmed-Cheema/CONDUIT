// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getConnections: vi.fn(),
  streamChat: vi.fn(),
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
  mocks.streamChat.mockReset().mockImplementation(async (
    _connectionId: string,
    _model: string,
    _messages: unknown[],
    onDelta: (delta: string) => void,
    onModel?: (model: string) => void,
    _signal?: AbortSignal,
    _options?: unknown,
    onUsage?: (usage: TokenUsage) => void,
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
    await screen.findByText(/OpenAI ? gpt-test/);

    expect(screen.getByText(/Automatic comparison is on/)).toBeTruthy();
    await user.type(screen.getByRole("textbox", { name: "Message" }), "Hello both");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText("Mocked response")).toBeTruthy();
    expect(mocks.streamChat.mock.calls[0]?.[9]).toEqual({
      mode: "automatic",
      candidates: [
        { connectionId: connection.id, model: "gpt-test" },
        { connectionId: "gemini", model: "gemini-model" },
      ],
    });
  });

  it("lets users select separate respondents and a judge and inspect originals", async () => {
    const openai: Connection = { ...connection, id: "openai", models: ["gpt-one"] };
    const gemini: Connection = {
      ...connection,
      id: "gemini",
      provider: "google",
      providerName: "Gemini",
      models: ["gemini-model"],
    };
    const judge: Connection = {
      ...connection,
      id: "judge",
      provider: "groq",
      providerName: "Groq",
      models: ["groq-model"],
    };
    mocks.getConnections.mockResolvedValue({ connections: [openai, gemini, judge], activeId: judge.id });
    mocks.streamChat.mockImplementationOnce(async (
      _connectionId: string,
      _model: string,
      _messages: unknown[],
      onDelta: (delta: string) => void,
      _onModel?: (model: string) => void,
      _signal?: AbortSignal,
      _options?: unknown,
      _onUsage?: (usage: TokenUsage) => void,
      onAlternatives?: (alternatives: ChatAlternative[]) => void,
      _comparison?: ChatComparisonRequest,
    ) => {
      onAlternatives?.([
        { providerName: "OpenAI", model: "gpt-one", content: "OpenAI original" },
        { providerName: "Gemini", model: "gemini-model", content: "Gemini original" },
      ]);
      onDelta("Groq final answer");
    });
    const user = userEvent.setup();
    renderChat();
    await screen.findByText(/Groq ? groq-model/);
    await user.click(screen.getByText("More options"));
    await user.click(screen.getByRole("checkbox", { name: "Enable multi-provider comparison" }));
    await user.type(screen.getByRole("textbox", { name: "Message" }), "Hello everyone");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText("Groq final answer")).toBeTruthy();
    expect(mocks.streamChat.mock.calls[0]?.[9]).toEqual({
      mode: "custom",
      candidates: [
        { connectionId: "openai", model: "gpt-one" },
        { connectionId: "gemini", model: "gemini-model" },
      ],
    });
    await user.click(screen.getByText("View 2 provider responses"));
    await user.click(screen.getByText("OpenAI ? gpt-one"));
    expect(screen.getByText("OpenAI original")).toBeTruthy();
    await user.click(screen.getByText("Gemini ? gemini-model"));
    expect(screen.getByText("Gemini original")).toBeTruthy();
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
