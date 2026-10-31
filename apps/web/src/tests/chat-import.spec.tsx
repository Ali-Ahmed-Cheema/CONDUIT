// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ImportConversationButton } from "../components/ImportConversationButton";
import { useAppStore, type ChatConversation } from "../store";

const exportedConversation: ChatConversation = {
  id: "exported-chat",
  title: "Project discussion",
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_100_000,
  connectionId: "connection",
  provider: "openai",
  model: "gpt-test",
  systemPrompt: "Keep answers concise",
  temperature: 0.4,
  maxTokens: 700,
  messages: [
    { id: "user-1", role: "user", content: "Continue from here", ts: 1_700_000_000_000 },
    { id: "assistant-1", role: "assistant", content: "Last response", ts: 1_700_000_100_000 },
  ],
};

beforeEach(() => {
  useAppStore.setState({
    connections: [{
      id: "connection",
      provider: "openai",
      providerName: "OpenAI",
      keyHint: "********1234",
      models: ["gpt-test"],
      addedAt: "2026-01-01T00:00:00.000Z",
      status: "valid",
      lastValidatedAt: "2026-01-01T00:00:00.000Z",
    }],
    activeConnectionId: "connection",
    activeModel: "gpt-test",
    conversations: [],
    activeConversationId: null,
  });
});

afterEach(() => {
  cleanup();
});

describe("chat import", () => {
  it("imports a chat as the active conversation with its messages and generation settings", async () => {
    const user = userEvent.setup();
    const { container } = render(<ImportConversationButton />);
    const file = new File([JSON.stringify(exportedConversation)], "project-chat.json", {
      type: "application/json",
    });

    await user.upload(container.querySelector<HTMLInputElement>('input[aria-label="Choose a chat JSON file"]')!, file);

    const state = useAppStore.getState();
    const imported = state.conversations[0];
    expect(imported).toMatchObject({
      ...exportedConversation,
      id: expect.not.stringMatching(/^exported-chat$/),
    });
    expect(state.activeConversationId).toBe(imported?.id);
    expect(state.activeModel).toBe("gpt-test");
    expect(screen.getByRole("status").textContent).toContain("made it active");
  });

  it("reports invalid chat files without changing the workspace", async () => {
    const user = userEvent.setup();
    const { container } = render(<ImportConversationButton />);
    const file = new File(["{}"], "not-a-chat.json", { type: "application/json" });

    await user.upload(container.querySelector<HTMLInputElement>('input[aria-label="Choose a chat JSON file"]')!, file);

    expect(screen.getByRole("alert").textContent).toBe("Choose a valid CONDUIT chat JSON export.");
    expect(useAppStore.getState().conversations).toEqual([]);
    expect(useAppStore.getState().activeConversationId).toBeNull();
  });
});
