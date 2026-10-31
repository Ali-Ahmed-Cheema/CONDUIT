import { ChatConversationSchema } from "@conduit/core";
import { Upload } from "lucide-react";
import { useRef, useState } from "react";
import { useAppStore } from "../store";

export function ImportConversationButton() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const importConversation = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;

    try {
      let value: unknown;
      try {
        value = JSON.parse(await file.text());
      } catch {
        throw new Error("The selected file is not valid JSON.");
      }

      const parsed = ChatConversationSchema.safeParse(value);
      if (!parsed.success) {
        throw new Error("Choose a valid CONDUIT chat JSON export.");
      }

      const state = useAppStore.getState();
      const conversation = { ...parsed.data, id: globalThis.crypto.randomUUID() };
      state.addConversation(conversation);

      const connection = state.connections.find((item) => item.id === conversation.connectionId)
        ?? state.connections.find((item) => item.provider === conversation.provider)
        ?? state.connections.find((item) => item.id === state.activeConnectionId);
      if (connection) {
        state.setActiveConnectionId(connection.id);
        state.setActiveModel(
          conversation.model && connection.models.includes(conversation.model)
            ? conversation.model
            : connection.models.includes(state.activeModel)
              ? state.activeModel
              : connection.models[0] ?? "",
        );
      }

      setError("");
      setMessage(`Imported "${conversation.title || "Untitled conversation"}" and made it active.`);
      window.location.hash = "/";
    } catch (reason) {
      setMessage("");
      setError(reason instanceof Error ? reason.message : "Could not import the chat.");
    }
  };

  return (
    <div>
      <input
        ref={fileInput}
        type="file"
        accept=".json,application/json"
        aria-label="Choose a chat JSON file"
        hidden
        onChange={(event) => void importConversation(event)}
      />
      <button type="button" className="secondary-button" onClick={() => fileInput.current?.click()}>
        <Upload size={16} /> <span>Import chat</span>
      </button>
      {error && <p className="error-alert" role="alert">{error}</p>}
      {message && <p className="success-alert" role="status">{message}</p>}
    </div>
  );
}
