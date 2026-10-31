import {
  ArrowRight,
  Contrast,
  Keyboard,
  Moon,
  Search,
  Settings,
  Sun,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useAppStore, type ThemeMode, type TextSize } from "../store";
import "./CommandPalette.css";

interface PaletteItem {
  id: string;
  label: string;
  description: string;
  icon: ReactNode;
  run: () => void;
}

export function CommandPalette() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const conversations = useAppStore((state) => state.conversations);
  const theme = useAppStore((state) => state.theme);
  const preferences = useAppStore((state) => state.preferences);
  const setTheme = useAppStore((state) => state.setTheme);
  const setPreferences = useAppStore((state) => state.setPreferences);
  const setActiveConversationId = useAppStore((state) => state.setActiveConversationId);

  const close = () => {
    setOpen(false);
    setQuery("");
    setActiveIndex(0);
  };

  const newChat = () => {
    setActiveConversationId(null);
    navigate("/");
  };

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      const modifier = event.metaKey || event.ctrlKey;
      if (!modifier) return;

      if (event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (open) {
          close();
        } else {
          returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
          setQuery("");
          setActiveIndex(0);
          setOpen(true);
        }
      } else if (event.shiftKey && event.key.toLowerCase() === "n") {
        event.preventDefault();
        close();
        newChat();
      } else if (event.key === ",") {
        event.preventDefault();
        close();
        navigate("/settings");
      }
    };

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [open, navigate, setActiveConversationId]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    return () => returnFocusRef.current?.focus();
  }, [open]);

  const items = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const route = (id: string, label: string, description: string, path: string, icon: ReactNode): PaletteItem => ({
      id,
      label,
      description,
      icon,
      run: () => navigate(path),
    });

    const commands: PaletteItem[] = [
      {
        id: "new-chat",
        label: "Start a new chat",
        description: "Clear the current selection and open the chat",
        icon: <ArrowRight size={17} />,
        run: newChat,
      },
      route("history", "Open chat history", "Search, pin, and manage conversations", "/history", <Search size={17} />),
      route("connections", "Connect an AI provider", "Manage provider keys and models", "/api-config", <Settings size={17} />),
      route("settings", "Open settings", "Personalize your workspace", "/settings", <Settings size={17} />),
      route("getting-started", "Open getting started", "Read setup and usage guidance", "/getting-started", <Keyboard size={17} />),
      route("credentials", "Open credential reference", "Browse supported credential formats", "/credentials", <Settings size={17} />),
      route("about", "About CONDUIT", "View app information and credits", "/about", <ArrowRight size={17} />),
      ...(["light", "dark", "system"] as ThemeMode[])
        .filter((mode) => mode !== theme)
        .map((mode) => ({
          id: `theme-${mode}`,
          label: `Use ${mode} theme`,
          description: "Change the workspace appearance",
          icon: mode === "light" ? <Sun size={17} /> : <Moon size={17} />,
          run: () => setTheme(mode),
        })),
      {
        id: "simple-mode",
        label: `${preferences.simpleMode ? "Turn off" : "Turn on"} Simple Mode`,
        description: "Show a simpler, less busy interface",
        icon: <Settings size={17} />,
        run: () => setPreferences({ simpleMode: !preferences.simpleMode }),
      },
      {
        id: "high-contrast",
        label: `${preferences.highContrast ? "Turn off" : "Turn on"} high contrast`,
        description: "Increase contrast between UI surfaces",
        icon: <Contrast size={17} />,
        run: () => setPreferences({ highContrast: !preferences.highContrast }),
      },
      {
        id: "reduce-motion",
        label: `${preferences.reduceMotion ? "Turn off" : "Turn on"} reduced motion`,
        description: "Reduce interface animations",
        icon: <Settings size={17} />,
        run: () => setPreferences({ reduceMotion: !preferences.reduceMotion }),
      },
      {
        id: "reduce-transparency",
        label: `${preferences.reduceTransparency ? "Turn off" : "Turn on"} reduced transparency`,
        description: "Use more opaque interface surfaces",
        icon: <Settings size={17} />,
        run: () => setPreferences({ reduceTransparency: !preferences.reduceTransparency }),
      },
      {
        id: "text-size",
        label: `Use ${nextTextSize(preferences.textSize)} text`,
        description: "Cycle through comfortable reading sizes",
        icon: <Settings size={17} />,
        run: () => setPreferences({ textSize: nextTextSize(preferences.textSize) }),
      },
    ];

    const matchingCommands = commands.filter((item) =>
      !normalized || `${item.label} ${item.description}`.toLowerCase().includes(normalized),
    );
    if (!normalized) return matchingCommands;

    const matchingConversations = conversations
      .filter((conversation) =>
        `${conversation.title} ${conversation.messages.map((message) => message.content).join(" ")}`
          .toLowerCase()
          .includes(normalized),
      )
      .slice(0, 8)
      .map((conversation): PaletteItem => ({
        id: `conversation-${conversation.id}`,
        label: conversation.title || "Untitled conversation",
        description: `Open conversation · ${conversation.messages.length} messages`,
        icon: <Search size={17} />,
        run: () => {
          setActiveConversationId(conversation.id);
          navigate("/");
        },
      }));

    return [...matchingCommands, ...matchingConversations];
  }, [conversations, navigate, preferences, query, setActiveConversationId, setPreferences, setTheme, theme]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const runItem = (item: PaletteItem | undefined) => {
    if (!item) return;
    close();
    item.run();
  };

  const handleDialogKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "ArrowDown" && items.length > 0) {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % items.length);
    } else if (event.key === "ArrowUp" && items.length > 0) {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + items.length) % items.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      runItem(items[activeIndex]);
    } else if (event.key === "Tab") {
      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>("button, input") ?? []);
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) {
        event.preventDefault();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  };

  if (!open) return null;

  return (
    <div
      className="command-palette-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        ref={dialogRef}
        className="command-palette"
        role="dialog"
        aria-modal="true"
        aria-labelledby="command-palette-title"
        onKeyDown={handleDialogKeyDown}
      >
        <h2 className="sr-only" id="command-palette-title">Command palette</h2>
        <div className="command-palette-search">
          <Search size={19} aria-hidden="true" />
          <input
            ref={inputRef}
            aria-label="Search commands and conversations"
            aria-controls="command-palette-results"
            aria-activedescendant={items[activeIndex] ? `command-option-${items[activeIndex].id}` : undefined}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search commands and conversations..."
          />
          <button type="button" className="command-palette-close" onClick={close} aria-label="Close command palette">
            <X size={17} />
          </button>
        </div>
        <div className="command-palette-results" id="command-palette-results" role="listbox" aria-label="Commands">
          {items.length > 0 ? items.map((item, index) => (
            <button
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              id={`command-option-${item.id}`}
              className={`command-palette-item${index === activeIndex ? " is-active" : ""}`}
              key={item.id}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => runItem(item)}
            >
              <span className="command-palette-item-icon" aria-hidden="true">{item.icon}</span>
              <span className="command-palette-item-copy">
                <strong>{item.label}</strong>
                <small>{item.description}</small>
              </span>
              {index === activeIndex && <span className="command-palette-enter">↵</span>}
            </button>
          )) : (
            <p className="command-palette-empty" role="status">No matching commands or conversations.</p>
          )}
        </div>
        <footer className="command-palette-footer">
          <span><kbd>↑</kbd><kbd>↓</kbd> to navigate</span>
          <span><kbd>Enter</kbd> to select</span>
          <span><kbd>Esc</kbd> to close</span>
        </footer>
      </div>
    </div>
  );
}

function nextTextSize(size: TextSize): TextSize {
  if (size === "normal") return "large";
  return size === "large" ? "extra-large" : "normal";
}
