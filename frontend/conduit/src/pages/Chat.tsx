import { Copy, SendHorizonal, Square } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { getConnections, limitChatHistory, streamChat } from "../api";
import { Header } from "../components/Header";
import { MarkdownContent } from "../components/MarkdownContent";
import { estimateTokens } from "../lib/tokens";
import { fullDateTime, greeting, msgTime } from "../lib/time";
import { type ChatMessage, useAppStore } from "../store";

const beep = () => {
  const AudioCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtor) return;
  const context = new AudioCtor();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = 660;
  gain.gain.value = 0.04;
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.12);
  oscillator.onended = () => void context.close();
};

export function ChatPage() {
  const connections = useAppStore((state) => state.connections);
  const setConnections = useAppStore((state) => state.setConnections);
  const activeConnectionId = useAppStore((state) => state.activeConnectionId);
  const setActiveConnectionId = useAppStore((state) => state.setActiveConnectionId);
  const activeModel = useAppStore((state) => state.activeModel);
  const setActiveModel = useAppStore((state) => state.setActiveModel);
  const activeConversationId = useAppStore((state) => state.activeConversationId);
  const conversations = useAppStore((state) => state.conversations);
  const addConversation = useAppStore((state) => state.addConversation);
  const appendMessage = useAppStore((state) => state.appendMessage);
  const updateConversation = useAppStore((state) => state.updateConversation);
  const soundOn = useAppStore((state) => state.soundOn);
  const vaultError = useAppStore((state) => state.vaultError);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "stopped" | "failed">("idle");
  const [error, setError] = useState("");
  const [connectionError, setConnectionError] = useState("");
  const [loadingConnections, setLoadingConnections] = useState(true);
  const messagesPanel = useRef<HTMLElement>(null);
  const shouldAutoScroll = useRef(true);
  const previousConversationId = useRef(activeConversationId);
  const requestController = useRef<AbortController | null>(null);

  useEffect(() => () => requestController.current?.abort(), []);

  const currentConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === activeConversationId) ?? null,
    [conversations, activeConversationId],
  );
  const activeConnection = connections.find((connection) => connection.id === activeConnectionId) ?? null;
  const messages = currentConversation?.messages ?? [];
  const totalTokens = messages.reduce((sum, message) => sum + estimateTokens(message.content || ""), 0);

  useEffect(() => {
    let cancelled = false;
    getConnections()
      .then((result) => {
        if (cancelled) return;
        setConnections(result.connections);
        setActiveConnectionId(result.activeId);
        const active = result.connections.find((connection) => connection.id === result.activeId);
        if (active && !active.models.includes(useAppStore.getState().activeModel)) {
          setActiveModel(active.models[0] ?? "");
        }
        setConnectionError("");
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setConnectionError(reason instanceof Error ? reason.message : "Could not connect to the API service.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingConnections(false);
      });
    return () => {
      cancelled = true;
    };
  }, [setActiveConnectionId, setActiveModel, setConnections]);

  useEffect(() => {
    const panel = messagesPanel.current;
    if (!panel) return;
    if (previousConversationId.current !== activeConversationId) {
      previousConversationId.current = activeConversationId;
      shouldAutoScroll.current = true;
    }
    if (shouldAutoScroll.current) panel.scrollTop = panel.scrollHeight;
  }, [activeConversationId, messages]);

  useEffect(() => {
    if (activeConnection?.models.length && !activeConnection.models.includes(activeModel)) {
      setActiveModel(activeConnection.models[0]);
    }
  }, [activeConnection, activeModel, setActiveModel]);

  const handleSend = async () => {
    if (!draft.trim() || sending) return;
    if (!activeConnection || !activeModel) {
      setError("Add and activate a valid API connection before sending.");
      return;
    }

    const userContent = draft.trim();
    const now = Date.now();
    const conversation = currentConversation ?? {
        id: globalThis.crypto.randomUUID(),
        title: "New conversation",
        createdAt: now,
        updatedAt: now,
        provider: activeConnection.provider,
        model: activeModel,
        connectionId: activeConnection.id,
        messages: [],
      };
    if (!currentConversation) addConversation(conversation);

    const conversationId = conversation.id;
    const userMessage: ChatMessage = {
      id: globalThis.crypto.randomUUID(),
      role: "user",
      content: userContent,
      ts: now,
      model: activeModel,
    };
    const assistantId = globalThis.crypto.randomUUID();
    appendMessage(conversationId, userMessage);
    const history = useAppStore.getState().conversations.find((item) => item.id === conversationId)?.messages ?? [];
    const requestMessages = limitChatHistory(history).map(({ role, content }) => ({ role, content }));
    appendMessage(conversationId, {
      id: assistantId,
      role: "assistant",
      content: "",
      ts: Date.now(),
      model: activeModel,
    });
    updateConversation(conversationId, (item) => ({
      ...item,
      title: item.title === "New conversation" ? userContent.slice(0, 72) : item.title,
      provider: activeConnection.provider,
      connectionId: activeConnection.id,
      model: activeModel,
    }));

    setDraft("");
    setStatus("sending");
    setError("");
    setSending(true);
    const controller = new AbortController();
    requestController.current = controller;

    try {
      let receivedContent = false;
      await streamChat(
        activeConnection.id,
        activeModel,
        requestMessages,
        (delta) => {
          receivedContent = true;
          updateConversation(conversationId, (item) => ({
            ...item,
            messages: item.messages.map((message) =>
              message.id === assistantId ? { ...message, content: message.content + delta } : message,
            ),
            updatedAt: Date.now(),
          }));
        },
        (reportedModel) => {
          updateConversation(conversationId, (item) => ({
            ...item,
            model: reportedModel,
            messages: item.messages.map((message) =>
              message.id === assistantId ? { ...message, model: reportedModel } : message,
            ),
          }));
        },
        controller.signal,
      );
      if (!receivedContent) throw new Error("The provider returned an empty response. Try again or choose another model.");
      setStatus("sent");
      if (soundOn) beep();
    } catch (reason) {
      updateConversation(conversationId, (item) => ({
        ...item,
        messages: item.messages.filter((message) => message.id !== assistantId || message.content.length > 0),
      }));
      if (reason instanceof Error && reason.name === "AbortError") {
        setStatus("stopped");
        setError("");
      } else {
        setStatus("failed");
        setError(reason instanceof Error ? reason.message : "The chat request failed.");
      }
    } finally {
      if (requestController.current === controller) requestController.current = null;
      setSending(false);
    }
  };

  const modelLabel = activeConnection
    ? `${activeConnection.providerName} · ${activeModel || "Choose a model"}`
    : loadingConnections ? "Connecting to API service..." : "No active API connection";

  return (
    <div className="page-shell">
      <Header title="CONDUIT V3.0" />
      <main className="chat-page">
        <div className="model-pill glass">{modelLabel}</div>

        <section
          className="messages-panel"
          aria-live="polite"
          ref={messagesPanel}
          onScroll={(event) => {
            const panel = event.currentTarget;
            shouldAutoScroll.current = panel.scrollHeight - panel.scrollTop - panel.clientHeight < 80;
          }}
        >
          {messages.length === 0 ? (
            <div className="empty-state"><h1>{greeting()}</h1></div>
          ) : messages.map((message) => (
            <article key={message.id} className={`message ${message.role}`}>
              <div className="message-meta">
                <strong>{message.role === "user" ? "You" : "Conduit"}</strong>
                <time dateTime={new Date(message.ts ?? Date.now()).toISOString()} title={fullDateTime(message.ts ?? Date.now())}>
                  {msgTime(message.ts ?? Date.now())}
                </time>
              </div>
              <div className="message-body">
                {message.content
                  ? <MarkdownContent content={message.content} onCopyError={() => setError("Could not copy code to the clipboard.")} />
                  : sending && message.role === "assistant" ? "Thinking..." : ""}
                {message.role === "assistant" && message.content && (
                  <button
                    type="button"
                    aria-label="Copy response"
                    className="response-copy-button"
                    onClick={() => void navigator.clipboard.writeText(message.content).catch(() => setError("Could not copy this response to the clipboard."))}
                  >
                    <Copy size={14} /> Copy response
                  </button>
                )}
              </div>
            </article>
          ))}
        </section>

        <div className="status-line" aria-live="polite">
          {sending ? "Sending..." : status === "sent" ? "Response complete" : status === "stopped" ? "Generation stopped" : status === "failed" ? "Request failed" : ""}
        </div>

        <div className="composer glass">
          <textarea
            aria-label="Message"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={activeConnection ? "Message..." : "Configure an API connection to start chatting"}
            rows={2}
            disabled={!activeConnection || loadingConnections || sending}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void handleSend();
              }
            }}
          />
          <div className="composer-row">
            <select
              aria-label="Chat model"
              value={activeModel}
              onChange={(event) => setActiveModel(event.target.value)}
              disabled={!activeConnection || sending}
            >
              {activeConnection?.models.map((model) => <option value={model} key={model}>{model}</option>)}
            </select>
            {sending ? (
              <button
                type="button"
                className="secondary-button"
                onClick={() => requestController.current?.abort()}
                aria-label="Stop response generation"
              >
                <Square size={15} /> Stop
              </button>
            ) : (
              <button
                type="button"
                className="primary-button"
                onClick={() => void handleSend()}
                disabled={!draft.trim() || !activeConnection || !activeModel}
              >
                <SendHorizonal size={16} /> Send
              </button>
            )}
          </div>
        </div>

        <p className="chat-footer">Conduit can make mistakes. Estimated (not exact): ~{totalTokens} tokens</p>
        {connectionError && <p className="error-alert" role="alert">{connectionError} <Link to="/api-config">Open API Config</Link></p>}
        {!connectionError && !loadingConnections && !activeConnection && (
          <p className="empty-history"><Link to="/api-config">Add an API connection to begin.</Link></p>
        )}
        {error && <p className="error-alert" role="alert">{error}</p>}
        {vaultError && <p className="error-alert" role="alert">{vaultError}</p>}
      </main>
    </div>
  );
}
