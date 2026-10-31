import { Copy, Download, Mic, MicOff, Pencil, Pin, PinOff, RefreshCw, SendHorizonal, Square, Trash2, Volume2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Link } from "react-router-dom";
import type { ChatAlternative, ChatComparisonRequest } from "@conduit/core";
import { ApiRequestError, getConnections, limitChatHistory, streamChat } from "../api";
import { Header } from "../components/Header";
import { MarkdownContent } from "../components/MarkdownContent";
import { EmptyState, Toast } from "@conduit/ui";
import { estimateTokens, makeTokenSummary } from "../lib/tokens";
import { fullDateTime, greeting, msgTime } from "../lib/time";
import { useAppStore } from "../store";

type DictationEvent = {
  resultIndex: number;
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
};

type DictationController = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: DictationEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechWindow = Window & {
  SpeechRecognition?: new () => DictationController;
  webkitSpeechRecognition?: new () => DictationController;
};

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
  const simpleMode = useAppStore((state) => state.preferences.simpleMode);
  const vaultError = useAppStore((state) => state.vaultError);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "stopped" | "failed">("idle");
  const [error, setError] = useState("");
  const [connectionError, setConnectionError] = useState("");
  const [loadingConnections, setLoadingConnections] = useState(true);
  const [comparisonEnabled, setComparisonEnabled] = useState(false);
  const [comparisonCandidates, setComparisonCandidates] = useState<ChatComparisonRequest["candidates"]>([]);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [temperature, setTemperature] = useState("");
  const [maxTokens, setMaxTokens] = useState("");
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState("");
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [readingMessageId, setReadingMessageId] = useState<string | null>(null);
  const [dictating, setDictating] = useState(false);
  const messagesPanel = useRef<HTMLElement>(null);
  const shouldAutoScroll = useRef(true);
  const previousConversationId = useRef(activeConversationId);
  const requestController = useRef<AbortController | null>(null);
  const dictationController = useRef<DictationController | null>(null);

  useEffect(() => () => {
    requestController.current?.abort();
    dictationController.current?.stop();
    window.speechSynthesis?.cancel();
  }, []);

  const speechRecognition = (window as SpeechWindow).SpeechRecognition
    ?? (window as SpeechWindow).webkitSpeechRecognition;

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
    const comparison = connections.length === 2
      ? {
          mode: "automatic" as const,
          candidates: connections.map((connection) => ({
            connectionId: connection.id,
            model: connection.id === activeConnectionId ? activeModel : connection.models[0] ?? "",
          })),
        }
      : comparisonEnabled
        ? { mode: "custom" as const, candidates: comparisonCandidates }
        : undefined;
    if (comparison && comparison.candidates.length < 2) {
      setError("Select at least two API connections to compare responses.");
      return;
    }
    if (comparison?.candidates.some((candidate) => !candidate.model)) {
      setError("Choose a conversational model for each response provider before sending.");
      return;
    }
    if (comparison?.mode === "custom" && comparison.candidates.some((candidate) => candidate.connectionId === activeConnectionId)) {
      setError("Choose respondent providers that are different from the judge provider.");
      return;
    }
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
        (alternatives: ChatAlternative[]) => {
          updateConversation(conversationId, (item) => ({
            ...item,
            messages: item.messages.map((message) => message.id === assistantId
              ? { ...message, alternatives }
              : message),
          }));
        },
        comparison,
        (comparisonNotice) => {
          updateConversation(conversationId, (item) => ({
            ...item,
            messages: item.messages.map((message) => message.id === assistantId
              ? { ...message, comparisonNotice }
              : message),
          }));
        },
      );
      if (!receivedContent) throw new Error("The provider returned an empty response. Try again or choose another model.");
      setStatus("sent");
      if (soundOn) beep();
    } catch (reason) {
      if (reason instanceof ApiRequestError) {
        const status = reason.status === 401 || reason.status === 403
          ? "invalid"
          : reason.status === 429
            ? "rate-limited"
            : undefined;
        if (status) {
          setConnections(useAppStore.getState().connections.map((connection) =>
            connection.id === activeConnection.id ? { ...connection, status } : connection,
          ));
        }
      }
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
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  };

  const startOrStopDictation = () => {
    if (dictationController.current) {
      dictationController.current.stop();
      dictationController.current = null;
      setDictating(false);
      return;
    }
    if (!speechRecognition) return;

    const recognition = new speechRecognition();
    recognition.lang = navigator.language;
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcript = Array.from(
        { length: event.results.length - event.resultIndex },
        (_, index) => event.results[event.resultIndex + index]?.[0]?.transcript ?? "",
      ).join(" ").trim();
      if (transcript) {
        setDraft((current) => `${current}${current.trim() ? " " : ""}${transcript}`);
      }
    };
    recognition.onerror = () => {
      setDictating(false);
      setError("Voice input stopped. Check microphone access, then try again.");
    };
    recognition.onend = () => {
      dictationController.current = null;
      setDictating(false);
    };
    dictationController.current = recognition;
    setError("");
    setDictating(true);
    try {
      recognition.start();
    } catch {
      dictationController.current = null;
      setDictating(false);
      setError("Voice input could not start. Check microphone access, then try again.");
    }
  };

  const toggleReadAloud = (messageId: string, content: string) => {
    if (!window.speechSynthesis || !("SpeechSynthesisUtterance" in window)) return;
    if (readingMessageId === messageId) {
      window.speechSynthesis.cancel();
      setReadingMessageId(null);
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(content);
    utterance.onend = () => setReadingMessageId(null);
    utterance.onerror = () => setReadingMessageId(null);
    setReadingMessageId(messageId);
    window.speechSynthesis.speak(utterance);
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
      <Header title="Chat" />
      <main id="main-content" className="chat-page" tabIndex={0} aria-label="Chat workspace">
        <h1 className="sr-only">{currentConversation?.title || "Chat"}</h1>
        <div className="model-pill glass">{modelLabel}</div>

        <details className="generation-options glass" open={!simpleMode}>
          <summary>More options</summary>
          {currentConversation && (
            <div className="conversation-toolbar">
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
                <span>{currentConversation.pinned ? "Unpin" : "Pin"}</span>
              </button>
              <button type="button" className="secondary-button" onClick={() => exportConversation("markdown")}>
                <Download size={16} /> <span>Markdown</span>
              </button>
              <button type="button" className="secondary-button" onClick={() => exportConversation("json")}>
                <Download size={16} /> <span>JSON</span>
              </button>
            </div>
          )}
          <div className="generation-fields">
            <label>
              {comparisonEnabled || connections.length === 2 ? "Judge provider" : "AI service"}
              <select
                aria-label="Chat connection"
                value={activeConnectionId ?? ""}
                onChange={(event) => {
                  const nextConnection = connections.find((connection) => connection.id === event.target.value);
                  setActiveConnectionId(nextConnection?.id ?? null);
                  setActiveModel(nextConnection?.models[0] ?? "");
                  setComparisonCandidates((current) =>
                    current.filter((candidate) => candidate.connectionId !== nextConnection?.id),
                  );
                }}
                disabled={sending || connections.length === 0}
              >
                {connections.length === 0 ? <option value="">No connections</option> : connections.map((connection) => (
                  <option key={connection.id} value={connection.id}>{connection.providerName} · {connection.keyHint}</option>
                ))}
              </select>
            </label>
            <label>
              {comparisonEnabled || connections.length === 2 ? "Judge model" : "Model"}
              <select
                aria-label="Chat model"
                value={activeModel}
                onChange={(event) => setActiveModel(event.target.value)}
                disabled={!activeConnection || sending}
              >
                {activeConnection?.models.map((model) => <option value={model} key={model}>{model}</option>)}
              </select>
            </label>
          </div>
          {connections.length === 2 && (
            <p className="comparison-mode-notice" role="status">
              Automatic comparison is on: both configured APIs respond, and the selected API judges their answers.
            </p>
          )}
          {connections.length > 2 && (
            <label className="comparison-toggle">
              <input
                type="checkbox"
                aria-label="Enable multi-provider comparison"
                checked={comparisonEnabled}
                onChange={(event) => {
                  const enabled = event.target.checked;
                  setComparisonEnabled(enabled);
                  setComparisonCandidates(enabled
                    ? connections
                      .filter((connection) => connection.id !== activeConnectionId && connection.models.length > 0)
                      .map((connection) => ({ connectionId: connection.id, model: connection.models[0] }))
                    : []);
                }}
                disabled={sending}
              />
              Enable multi-provider comparison
            </label>
          )}
          {comparisonEnabled && (
            <fieldset className="comparison-settings" disabled={sending}>
              <legend>Respondent providers</legend>
              {connections.map((connection) => {
                const candidate = comparisonCandidates.find((item) => item.connectionId === connection.id);
                return (
                  <div className="comparison-provider" key={connection.id}>
                    <label>
                      <input
                        type="checkbox"
                        aria-label={`Send to ${connection.providerName} ${connection.keyHint}`}
                        checked={Boolean(candidate)}
                        disabled={connection.models.length === 0 || connection.id === activeConnectionId}
                        onChange={(event) => {
                          if (event.target.checked) {
                            setComparisonCandidates((current) => [
                              ...current,
                              { connectionId: connection.id, model: connection.models[0] ?? "" },
                            ]);
                          } else {
                            setComparisonCandidates((current) =>
                              current.filter((item) => item.connectionId !== connection.id),
                            );
                          }
                        }}
                      />
                      {connection.providerName} ? {connection.keyHint}
                    </label>
                    {candidate && (
                      <label>
                        Response model
                        <select
                          aria-label={`Response model for ${connection.providerName} ${connection.keyHint}`}
                          value={candidate.model}
                          onChange={(event) => setComparisonCandidates((current) => current.map((item) =>
                            item.connectionId === connection.id ? { ...item, model: event.target.value } : item,
                          ))}
                        >
                          {connection.models.map((model) => <option value={model} key={model}>{model}</option>)}
                        </select>
                      </label>
                    )}
                  </div>
                );
              })}
              <p>Choose at least two respondent APIs. The judge provider above must be different from every respondent.</p>
              {comparisonCandidates.length < 2 && (
                <p className="error-alert" role="status">Select at least two respondent APIs.</p>
              )}
            </fieldset>
          )}
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
          tabIndex={0}
          aria-label="Chat messages"
          aria-live="off"
          ref={messagesPanel}
          onScroll={(event) => {
            const panel = event.currentTarget;
            shouldAutoScroll.current = panel.scrollHeight - panel.scrollTop - panel.clientHeight < 80;
          }}
        >
          {messages.length === 0 ? (
            <EmptyState title={greeting()} description="Ask me anything. Write a message below and press Send." />
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
                      <strong>{message.role === "user" ? "You" : "AI"}</strong>
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
                      {message.comparisonNotice && (
                        <p className="comparison-mode-notice" role="status">{message.comparisonNotice}</p>
                      )}
                      {message.alternatives?.length ? (
                        <details className="comparison-responses">
                          <summary>View {message.alternatives.length} provider responses</summary>
                          {message.alternatives.map((alternative, index) => (
                            <section key={`${alternative.providerName}-${alternative.model}-${index}`}>
                              <details>
                                <summary>{alternative.providerName} ? {alternative.model}</summary>
                                <MarkdownContent content={alternative.content} onCopyError={() => setError("Could not copy code to the clipboard.")} />
                              </details>
                            </section>
                          ))}
                        </details>
                      ) : null}
                      {message.role === "assistant" && message.content && (
                        <div className="message-actions">
                          <button
                            type="button"
                            aria-label="Copy response"
                            className="response-copy-button"
                            onClick={() => void Promise.resolve().then(() => navigator.clipboard.writeText(message.content)).then(() => {
                              setCopiedMessageId(messageId ?? null);
                            }).catch(() => setError("Could not copy this response. Check clipboard access, then try again."))}
                          >
                            <Copy size={18} /> {copiedMessageId === messageId ? "Copied!" : "Copy"}
                          </button>
                          {"speechSynthesis" in window && (
                            <button
                              type="button"
                              className="secondary-button"
                              onClick={() => toggleReadAloud(messageId ?? "", message.content)}
                            >
                              <Volume2 size={18} /> {readingMessageId === messageId ? "Stop reading" : "Read aloud"}
                            </button>
                          )}
                        </div>
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
          {sending ? "AI is thinking…" : status === "sent" ? "Response complete" : status === "stopped" ? "Generation stopped" : status === "failed" ? "Request failed" : ""}
        </div>

        <div className="composer glass">
          <textarea
            aria-label="Message"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={activeConnection ? "Write a message..." : "Connect an AI service before chatting"}
            rows={2}
            onInput={(event) => {
              event.currentTarget.style.height = "auto";
              event.currentTarget.style.height = `${event.currentTarget.scrollHeight}px`;
            }}
            disabled={!activeConnection || loadingConnections || sending}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void handleSend();
              }
            }}
          />
          <div className="composer-row">
            {speechRecognition && !sending && (
              <button
                type="button"
                className="danger-button"
                onClick={startOrStopDictation}
                aria-label={dictating ? "Stop microphone" : "Start microphone"}
              >
                {dictating ? <MicOff size={20} /> : <Mic size={20} />}
                {dictating ? "Stop microphone" : "Microphone"}
              </button>
            )}
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
      {copiedMessageId && <Toast message="Copied to clipboard." onDismiss={() => setCopiedMessageId(null)} />}
    </div>
  );
}
