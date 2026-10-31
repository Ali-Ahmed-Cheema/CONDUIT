import { Pin, PinOff, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Header } from "../components/Header";
import { ImportConversationButton } from "../components/ImportConversationButton";
import { EmptyState, GlassCard } from "@conduit/ui";
import { groupConversations } from "../lib/group";
import { F } from "../lib/time";
import { useAppStore } from "../store";

export function HistoryPage() {
  const conversations = useAppStore((state) => state.conversations);
  const setConversations = useAppStore((state) => state.setConversations);
  const updateConversation = useAppStore((state) => state.updateConversation);
  const setActiveConversationId = useAppStore((state) => state.setActiveConversationId);
  const activeConversationId = useAppStore((state) => state.activeConversationId);
  const [query, setQuery] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!deleteConfirm) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusableElements = () => Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? [],
    );
    focusableElements()[0]?.focus();

    const trapDialogFocus = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedId(null);
        setDeleteConfirm(false);
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = focusableElements();
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) {
        event.preventDefault();
        dialogRef.current?.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", trapDialogFocus);
    return () => {
      document.removeEventListener("keydown", trapDialogFocus);
      previousFocus?.focus();
    };
  }, [deleteConfirm]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return [...conversations].sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || b.createdAt - a.createdAt).filter((conversation) =>
      !normalized ||
      conversation.title.toLowerCase().includes(normalized) ||
      conversation.messages.some((message) => message.content.toLowerCase().includes(normalized)),
    );
  }, [conversations, query]);

  const groups = useMemo(() => groupConversations(filtered), [filtered]);
  const selectedConversation = conversations.find((conversation) => conversation.id === selectedId);

  const openConversation = (id: string) => {
    setActiveConversationId(id);
    window.location.hash = "/";
  };

  const deleteConversation = () => {
    if (!selectedId) return;
    setConversations(conversations.filter((conversation) => conversation.id !== selectedId));
    if (activeConversationId === selectedId) setActiveConversationId(null);
    setSelectedId(null);
    setDeleteConfirm(false);
  };

  return (
    <div className="page-shell">
      <Header title="History" showBack />
      <main id="main-content" className="history-page">
        <h1 className="sr-only">Chat history</h1>
        <div className="conversation-toolbar">
          <ImportConversationButton />
        </div>
        <form className="search-box glass" role="search" onSubmit={(event) => {
          event.preventDefault();
          setQuery(searchInput);
        }}>
          <Search size={16} />
          <input aria-label="Search history" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Search history" />
          <button type="submit">Search</button>
        </form>

        {filtered.length === 0 ? (
          <EmptyState
            title={query ? "No chats found" : "No conversations yet"}
            description={query ? "Try a different search." : "Start a new chat to see it here."}
            action={!query ? (
              <button type="button" className="primary-button" onClick={() => {
                setActiveConversationId(null);
                window.location.hash = "/";
              }}>New chat</button>
            ) : undefined}
          />
        ) : (
          Array.from(groups.entries()).map(([label, items]) => (
            <section key={label} className="history-group">
              <h2>{label}</h2>
              {items.map((conversation) => (
                <GlassCard key={conversation.id} className="history-item">
                  <button type="button" className="history-open" onClick={() => openConversation(conversation.id)}>
                    <strong>{conversation.title || "Untitled conversation"}</strong>
                    <small>{F({ dateStyle: "medium", timeStyle: "short", hour12: true }).format(conversation.createdAt)}</small>
                    <span>{conversation.pinned ? "Pinned · " : ""}{conversation.provider ?? "Unknown provider"} · {conversation.model || "Unknown model"}</span>
                  </button>
                  <button
                    type="button"
                    className="icon-button history-pin"
                    aria-label={conversation.pinned ? `Unpin ${conversation.title || "conversation"}` : `Pin ${conversation.title || "conversation"}`}
                    onClick={() => updateConversation(conversation.id, (item) => ({ ...item, pinned: !item.pinned }))}
                  >
                    {conversation.pinned ? <PinOff size={16} /> : <Pin size={16} />}
                  </button>
                  <button
                    type="button"
                    className="icon-button history-delete"
                    aria-label={`Delete ${conversation.title || "conversation"}`}
                    onClick={() => {
                      setSelectedId(conversation.id);
                      setDeleteConfirm(true);
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                </GlassCard>
              ))}
            </section>
          ))
        )}
      </main>

      {deleteConfirm && (
        <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setDeleteConfirm(false);
        }}>
          <div ref={dialogRef} className="dialog glass" role="dialog" aria-modal="true" aria-labelledby="delete-dialog-title" tabIndex={-1}>
            <h3 id="delete-dialog-title">Delete “{selectedConversation?.title || "Untitled conversation"}”?</h3>
            <p>This removes the chat and its messages from this device. This cannot be undone.</p>
            <div className="dialog-actions">
              <button type="button" className="secondary-button" onClick={() => setDeleteConfirm(false)}>Cancel</button>
              <button type="button" className="danger-button" onClick={deleteConversation}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
