import { beforeEach, describe, expect, it } from "vitest";
import { useChatStore } from "../src/store";

describe("chat history store", () => {
  beforeEach(() => {
    useChatStore.setState({
      conversations: [],
      activeConversationId: null,
      currentConnectionId: null,
      currentModel: "",
    });
  });

  it("creates independent conversations with their selected connection and model", () => {
    const firstId = useChatStore.getState().startNewConversation("connection-a", "model-a");
    const secondId = useChatStore.getState().startNewConversation("connection-b", "model-b");

    expect(secondId).not.toBe(firstId);
    expect(useChatStore.getState().activeConversationId).toBe(secondId);
    expect(useChatStore.getState().conversations.map(({ connectionId, model }) => [connectionId, model])).toEqual([
      ["connection-b", "model-b"],
      ["connection-a", "model-a"],
    ]);
  });

  it("updates the intended conversation and derives its title from the first user message", () => {
    const firstId = useChatStore.getState().startNewConversation("connection-a", "model-a");
    const secondId = useChatStore.getState().startNewConversation("connection-b", "model-b");
    useChatStore.getState().setConversationMessages(firstId, [{ role: "user", content: "Earlier question" }]);

    const first = useChatStore.getState().conversations.find((item) => item.id === firstId);
    expect(first?.title).toBe("Earlier question");
    expect(first?.messages).toEqual([{ role: "user", content: "Earlier question" }]);
    expect(useChatStore.getState().activeConversationId).toBe(secondId);
  });
});
