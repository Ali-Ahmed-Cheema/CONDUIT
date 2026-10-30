import { beforeEach, describe, expect, it } from "vitest";
import { useAppStore, type ChatConversation } from "../src/store";

describe("chat history store", () => {
  beforeEach(() => {
    useAppStore.setState({ conversations: [], activeConversationId: null });
  });

  it("creates independent conversations with their selected connection and model", () => {
    const first: ChatConversation = {
      id: "first",
      title: "First",
      createdAt: 1,
      updatedAt: 1,
      connectionId: "connection-a",
      model: "model-a",
      messages: [],
    };
    const second: ChatConversation = {
      id: "second",
      title: "Second",
      createdAt: 2,
      updatedAt: 2,
      connectionId: "connection-b",
      model: "model-b",
      messages: [],
    };
    useAppStore.getState().addConversation(first);
    useAppStore.getState().addConversation(second);

    expect(useAppStore.getState().activeConversationId).toBe(second.id);
    expect(useAppStore.getState().conversations.map(({ connectionId, model }) => [connectionId, model])).toEqual([
      ["connection-b", "model-b"],
      ["connection-a", "model-a"],
    ]);
  });

  it("updates the intended conversation and derives its title from the first user message", () => {
    const firstId = "first";
    const secondId = "second";
    useAppStore.getState().addConversation({
      id: firstId,
      title: "First",
      createdAt: 1,
      updatedAt: 1,
      model: "model-a",
      messages: [],
    });
    useAppStore.getState().addConversation({
      id: secondId,
      title: "Second",
      createdAt: 2,
      updatedAt: 2,
      model: "model-b",
      messages: [],
    });
    useAppStore.getState().updateConversation(firstId, (conversation) => ({
      ...conversation,
      title: "Earlier question",
      messages: [{ role: "user", content: "Earlier question" }],
    }));

    const first = useAppStore.getState().conversations.find((item) => item.id === firstId);
    expect(first?.title).toBe("Earlier question");
    expect(first?.messages).toEqual([{ role: "user", content: "Earlier question" }]);
    expect(useAppStore.getState().activeConversationId).toBe(secondId);
  });
});
