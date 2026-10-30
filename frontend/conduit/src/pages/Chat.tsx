import { Copy, Download, Pencil, Pin, PinOff, RefreshCw, SendHorizonal, Square, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Link } from "react-router-dom";
import { getConnections, limitChatHistory, streamChat } from "../api";
import { Header } from "../components/Header";
import { MarkdownContent } from "../components/MarkdownContent";
import { estimateTokens, makeTokenSummary } from "../lib/tokens";
import { fullDateTime, greeting, msgTime } from "../lib/time";
import { useAppStore } from "../store";

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
  const [systemPrompt, setSystemPrompt] = useState("");
  const [temperature, setTemperature] = useState("");
  const [maxTokens, setMaxTokens] = useState("");
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState("");
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
  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => messagesPanel.current,
    estimateSize: () => 180,
    overscan: 5,
  });
  const assistantMessages = messages.filter((message) => message.role === "assistant" && message.content);
  const hasCompleteUsage = assistantMessages.length > 0 && assistantMessages.every((message) => message.usage);
  const reportedUsage = assistantMessages.reduce(
    (usage, message) => ({
      input: usage.input + (message.usage?.input ?? 0),
      output: usage.output + (message.usage?.output ?? 0),
    }),
    { input: 0, output: 0 },
  );
  const estimatedTokens = messages.reduce((sum, message) => sum + estimateTokens(message.content || ""), 0);
  const tokenSummary = hasCompleteUsage
    ? makeTokenSummary(reportedUsage)
    : makeTokenSummary(undefined, estimatedTokens);

  useEffect(() => {
    setSystemPrompt(currentConversation?.systemPrompt ?? "");
    setTemperature(currentConversation?.temperature === undefined ? "" : String(currentConversation.temperature));
    setMaxTokens(currentConversation?.maxTokens === undefined ? "" : String(currentConversation.maxTokens));
    setEditingMessageId(null);
  }, [activeConversationId, currentConversation?.systemPrompt, currentConversation?.temperature, currentConversation?.maxTokens]);

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
    if (shouldAutoScroll.current && messages.length > 0) {
      virtualizer.scrollToIndex(messages.length - 1, { align: "end" });
    }
  }, [activeConversationId, messages, virtualizer]);

  useEffect(() => {
    if (activeConnection?.models.length && !activeConnection.models.includes(activeModel)) {
      setActiveModel(activeConnection.models[0]);
    }
  }, [activeConnection, activeModel, setActiveModel]);

  const handleSend = async (contentOverride?: string, existingUserId?: string, continueMessageId?: string) => {
    const userContent = (contentOverride ?? draft).trim();
    if (!userContent || sending) return;
    if (!activeConnection || !activeModel) {
      setError("Add and activate a valid API connection before sending.");
      return;
    }

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
    if (existingUserId) {
      const stateConversation = useAppStore.getState().conversations.find((item) => item.id === conversationId);
      if (!stateConversation?.messages.some((message) => message.id === existingUserId && message.role === "user")) return;
    } else {
      appendMessage(conversationId, {
        id: globalThis.crypto.randomUUID(),
        role: "user",
        content: userContent,
        ts: now,
        model: activeModel,
      });
    }
    const assistantId = continueMessageId ?? globalThis.crypto.randomUUID();
    if (continueMessageId) {
      updateConversation(conversationId, (item) => ({
        ...item,
        messages: item.messages.map((message) =>
          message.id === assistantId ? { ...message, failed: false, incomplete: false } : message,
        ),
      }));
    }
    const history = useAppStore.getState().conversations.find((item) => item.id === conversationId)?.messages ?? [];
    const requestMessages = limitChatHistory(history).map(({ role, content }) => ({ role, content }));
    if (!continueMessageId) {
      appendMessage(conversationId, {
        id: assistantId,
        role: "assistant",
        content: "",
        ts: Date.now(),
        model: activeModel,
      });
    }
    const generationOptions = {
      systemPrompt: systemPrompt.trim(),
      ...(temperature === "" ? {} : { temperature: Number(temperature) }),
      ...(maxTokens === "" ? {} : { maxTokens: Number(maxTokens) }),
    };
    updateConversation(conversationId, (item) => ({
      ...item,
      title: item.title === "New conversation" ? userContent.slice(0, 72) : item.title,
      provider: activeConnection.provider,
      connectionId: activeConnection.id,
      model: activeModel,
      systemPrompt: generationOptions.systemPrompt,
      temperature: generationOptions.temperature,
      maxTokens: generationOptions.maxTokens,
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
              message.id === assistantId
                ? { ...message, content: message.content + delta, failed: false, incomplete: false }
                : message,
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
        generationOptions,
        (usage) => {
          updateConversation(conversationId, (item) => ({
            ...item,
            messages: item.messages.map((message) => message.id === assistantId
              ? { ...message, usage: { ...message.usage, ...usage } }
              : message),
          }));
        },
      );
      if (!receivedContent) throw new Error("The provider returned an empty response. Try again or choose another model.");
      setStatus("sent");
      if (soundOn) beep();
    } catch (reason) {
      updateConversation(conversationId, (item) => ({
        ...item,
        messages: item.messages.map((message) =>
          message.id === assistantId ? { ...message, incomplete: true, failed: true } : message,
        ),
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

  const retryResponse = (assistantId: string, continueExisting: boolean) => {
    if (!currentConversation) return;
    const assistantIndex = currentConversation.messages.findIndex((message) => message.id === assistantId);
    const userMessage = currentConversation.messages
      .slice(0, assistantIndex)
      .reverse()
      .find((message) => message.role === "user");
    if (!userMessage?.id) return;
    if (continueExisting) {
      void handleSend(userMessage.content, userMessage.id, assistantId);
      return;
    }
    updateConversation(currentConversation.id, (item) => ({
      ...item,
      messages: item.messages.slice(0, item.messages.findIndex((message) => message.id === assistantId)),
    }));
    void handleSend(userMessage.content, userMessage.id);
  };

  const editAndResend = (messageId: string) => {
    if (!currentConversation) return;
    const index = currentConversation.messages.findIndex((message) => message.id === messageId);
    const edited = editingContent.trim();
    if (index < 0 || !edited) return;
    updateConversation(currentConversation.id, (item) => ({
      ...item,
      messages: item.messages.slice(0, index + 1).map((message) =>
        message.id === messageId ? { ...message, content: edited, ts: Date.now() } : message,
      ),
    }));
    setEditingMessageId(null);
    void handleSend(edited, messageId);
  };

  const removeMessage = (messageId: string) => {
    if (!currentConversation) return;
    updateConversation(currentConversation.id, (item) => ({
      ...item,
      messages: item.messages.filter((message) => message.id !== messageId),
    }));
  };

  const exportConversation = (format: "markdown" | "json") => {
    if (!currentConversation) return;
    const body = format === "json"
      ? JSON.stringify(currentConversation, null, 2)
      : `# ${currentConversation.title}\n\n${currentConversation.messages
          .map((message) => `## ${message.role === "user" ? "You" : "Assistant"}\n\n${message.content}`)
          .join("\n\n")}\n`;
    const file = new Blob([body], { type: format === "json" ? "application/json" : "text/markdown" });
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    const safeTitle = currentConversation.title.replace(/[\\/:*?"<>|]+/g, "-") || "conversation";
    link.download = `${safeTitle}.${format === "json" ? "json" : "md"}`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const modelLabel = activeConnection
    ? `${activeConnection.providerName} · ${activeModel || "Choose a model"}`
    : loadingConnections ? "Connecting to API service..." : "No active API connection";
  const modelUnavailable = Boolean(
    currentConversation?.model &&
      activeConnection &&
      currentConversation.connectionId === activeConnection.id &&
      !activeConnection.models.includes(currentConversation.model),
  );
  const virtualMessages = virtualizer.getVirtualItems();

  return (
    <div className="page-shell">
      <Header title="CONDUIT V3.0" />
      <main className="chat-page">
        <div className="model-pill glass">{modelLabel}</div>

        {currentConversation && (
          <div className="conversation-toolbar glass">
            <label>
              <span className="sr-only">Conversation name</span>
              <input
                aria-label="Conversation name"
                value={currentConversation.title}
                onChange={(event) => updateConversation(currentConversation.id, (item) => ({
                  ...item,
                  title: event.target.value,
                }))}
                maxLength={120}
              />
            </label>
            <button
              type="button"
              className="icon-button"
              aria-label={currentConversation.pinned ? "Unpin conversation" : "Pin conversation"}
              onClick={() => updateConversation(currentConversation.id, (item) => ({ ...item, pinned: !item.pinned }))}
            >
              {currentConversation.pinned ? <PinOff size={16} /> : <Pin size={16} />}
            </button>
            <button type="button" className="icon-button" aria-label="Export conversation as Markdown" onClick={() => exportConversation("markdown")}>
              <Download size={16} /> .md
            </button>
            <button type="button" className="icon-button" aria-label="Export conversation as JSON" onClick={() => exportConversation("json")}>
              <Download size={16} /> .json
            </button>
          </div>
        )}

        <details className="generation-options glass">
          <summary>System prompt and generation options</summary>
          <label>
            System prompt
            <textarea
              value={systemPrompt}
              maxLength={12_000}
              rows={3}
              onChange={(event) => {
                const value = event.target.value;
                setSystemPrompt(value);
                if (currentConversation) {
                  updateConversation(currentConversation.id, (item) => ({ ...item, systemPrompt: value }));
                }
              }}
            />
          </label>
          <div className="generation-fields">
            <label>
              Temperature (0–2)
              <input
                aria-label="Temperature"
                type="number"
                min="0"
                max="2"
                step="0.1"
                value={temperature}
                onChange={(event) => {
                  const value = event.target.value;
                  setTemperature(value);
                  if (currentConversation) {
                    updateConversation(currentConversation.id, (item) => ({
                      ...item,
                      temperature: value === "" ? undefined : Number(value),
                    }));
                  }
                }}
              />
            </label>
            <label>
              Max tokens (1–200000)
              <input
                aria-label="Max tokens"
                type="number"
                min="1"
                max="200000"
                step="1"
                value={maxTokens}
                onChange={(event) => {
                  const value = event.target.value;
                  setMaxTokens(value);
                  if (currentConversation) {
                    updateConversation(currentConversation.id, (item) => ({
                      ...item,
                      maxTokens: value === "" ? undefined : Number(value),
                    }));
                  }
                }}
              />
            </label>
          </div>
        </details>

        {modelUnavailable && (
          <p className="error-alert" role="status">
            This conversation’s previous model is no longer available for this connection. Choose an available model below to continue.
          </p>
        )}

        <section
          className="messages-panel"
          aria-live="off"
          ref={messagesPanel}
          onScroll={(event) => {
            const panel = event.currentTarget;
            shouldAutoScroll.current = panel.scrollHeight - panel.scrollTop - panel.clientHeight < 80;
          }}
        >
          {messages.length === 0 ? (
            <div className="empty-state"><h1>{greeting()}</h1></div>
          ) : (
            <div className="messages-virtual-content" style={{ height: `${virtualizer.getTotalSize()}px` }}>
              {virtualMessages.map((virtualItem) => {
                const message = messages[virtualItem.index];
                const messageId = message.id;
                const previousUser = messages.slice(0, virtualItem.index).reverse()
                  .find((item) => item.role === "user");
                return (
                  <article
                    key={messageId ?? virtualItem.key}
                    ref={virtualizer.measureElement}
                    data-index={virtualItem.index}
                    className={`message ${message.role}`}
                    style={{ transform: `translateY(${virtualItem.start}px)` }}
                  >
                    <div className="message-meta">
                      <strong>{message.role === "user" ? "You" : "Conduit"}</strong>
                      <time dateTime={new Date(message.ts ?? Date.now()).toISOString()} title={fullDateTime(message.ts ?? Date.now())}>
                        {msgTime(message.ts ?? Date.now())}
                      </time>
                      {message.model && <small>{message.model}</small>}
                    </div>
                    <div className="message-body" aria-live={sending && virtualItem.index === messages.length - 1 ? "polite" : undefined}>
                      {editingMessageId === messageId ? (
                        <div className="message-edit">
                          <textarea aria-label="Edit message" value={editingContent} onChange={(event) => setEditingContent(event.target.value)} />
                          <button type="button" className="secondary-button" onClick={() => editAndResend(messageId ?? "")}>Save and resend</button>
                          <button type="button" className="secondary-button" onClick={() => setEditingMessageId(null)}>Cancel edit</button>
                        </div>
                      ) : message.content ? (
                        <MarkdownContent content={message.content} onCopyError={() => setError("Could not copy code to the clipboard.")} />
                      ) : sending && message.role === "assistant" ? "Thinking..." : ""}
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
                      {messageId && !sending && (
                        <div className="message-actions">
                          {message.role === "user" && (
                            <button
                              type="button"
                              className="secondary-button"
                              onClick={() => {
                                setEditingMessageId(messageId);
                                setEditingContent(message.content);
                              }}
                            >
                              <Pencil size={14} /> Edit and resend
                            </button>
                          )}
                          {message.role === "assistant" && previousUser?.id && (
                            message.incomplete || message.failed ? (
                              <>
                                <button type="button" className="secondary-button" onClick={() => retryResponse(messageId, true)}>
                                  <RefreshCw size={14} /> Continue
                                </button>
                                <button type="button" className="secondary-button" onClick={() => retryResponse(messageId, false)}>
                                  <RefreshCw size={14} /> Retry
                                </button>
                              </>
                            ) : (
                              <button type="button" className="secondary-button" onClick={() => retryResponse(messageId, false)}>
                                <RefreshCw size={14} /> Regenerate
                              </button>
                            )
                          )}
                          <button type="button" className="icon-button" aria-label="Delete message" onClick={() => removeMessage(messageId)}>
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
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
              aria-label="Chat connection"
              value={activeConnectionId ?? ""}
              onChange={(event) => {
                const nextConnection = connections.find((connection) => connection.id === event.target.value);
                setActiveConnectionId(nextConnection?.id ?? null);
                setActiveModel(nextConnection?.models[0] ?? "");
              }}
              disabled={sending || connections.length === 0}
            >
              {connections.length === 0 ? <option value="">No connections</option> : connections.map((connection) => (
                <option key={connection.id} value={connection.id}>{connection.providerName} · {connection.keyHint}</option>
              ))}
            </select>
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

        <p className="chat-footer">Conduit can make mistakes. {tokenSummary} tokens</p>
        {connectionError && <p className="error-alert" role="alert">{connectionError} <Link to="/api-config">Open API Config</Link></p>}
        {!connectionError && !loadingConnections && !activeConnection && (
          <p className="error-alert" role="status">No active connection is configured. <Link to="/api-config">Open API Config</Link> to add or activate one.</p>
        )}
        {error && <p className="error-alert" role="alert">{error}</p>}
        {vaultError && <p className="error-alert" role="alert">{vaultError}</p>}
      </main>
    </div>
  );
}
