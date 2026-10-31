import { ArrowLeft, BookOpen, Bot, Clock3, Info, KeyRound, Menu, Plus, Settings, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { GlassTabBar, HelpButton, type GlassTab } from "@conduit/ui";
import { useAppStore } from "../store";

interface HeaderProps {
  title: string;
  showBack?: boolean;
}

export function Header({ title, showBack = false }: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const setActiveConversationId = useAppStore((state) => state.setActiveConversationId);
  const location = useLocation();
  const navigate = useNavigate();
  const moreButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMenuOpen(false);
      moreButtonRef.current?.focus();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [menuOpen]);

  const tabs: GlassTab[] = [
    { href: "/", label: "New chat", icon: <Plus size={20} />, current: location.pathname === "/", onClick: () => setActiveConversationId(null) },
    { href: "/history", label: "History", icon: <Clock3 size={20} />, current: location.pathname === "/history" },
    { href: "/api-config", label: "Connect AI", icon: <Sparkles size={20} />, current: location.pathname === "/api-config" },
    { href: "/settings", label: "Settings", icon: <Settings size={20} />, current: location.pathname === "/settings" },
  ];

  return (
    <header className="topbar">
      <a className="skip-link" href="#main-content">Skip to main content</a>
      {showBack && (
        <button
          type="button"
          className="secondary-button"
          aria-label="Back"
          onClick={() => {
            const historyIndex = window.history.state?.idx;
            if (typeof historyIndex === "number" && historyIndex > 0) navigate(-1);
            else navigate("/");
          }}
        >
          <ArrowLeft size={18} /><span>Back</span>
        </button>
      )}
      <div className="brand-panel">
        <span className="brand-label">{title}</span>
      </div>
      <GlassTabBar tabs={tabs} className="workspace-nav glass">
        <button
          ref={moreButtonRef}
          type="button"
          aria-expanded={menuOpen}
          aria-controls="more-navigation"
          onClick={() => setMenuOpen((value) => !value)}
        >
          <Menu size={20} /><span>More</span>
        </button>
        {menuOpen && (
          <div className="more-menu glass" id="more-navigation">
            <Link to="/getting-started" onClick={() => setMenuOpen(false)}><BookOpen size={20} />Getting started</Link>
            <Link to="/about" onClick={() => setMenuOpen(false)}><Info size={20} />About</Link>
            <Link to="/credentials" onClick={() => setMenuOpen(false)}><KeyRound size={20} />Credential reference</Link>
          </div>
        )}
      </GlassTabBar>
      <HelpButton screen={title} />
      <Link to="/" className="brand-home" aria-label="CONDUIT home"><Bot size={20} /><span>CONDUIT</span></Link>
    </header>
  );
}
