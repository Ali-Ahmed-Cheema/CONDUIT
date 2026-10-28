import { ArrowLeft, Clock3, Lock, Menu, Plus, Shield } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { F } from "../lib/time";
import { lockApp } from "../lib/lock";
import { useAppStore } from "../store";

interface HeaderProps {
  title: string;
  showBack?: boolean;
  showLock?: boolean;
}

export function Header({ title, showBack = false, showLock = true }: HeaderProps) {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [now, setNow] = useState(new Date());
  const setActiveConversationId = useAppStore((state) => state.setActiveConversationId);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 20000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <header className="topbar glass">
      <div className="topbar-left">
        {showBack ? (
          <button type="button" className="icon-button" aria-label="Back" onClick={() => navigate(-1)}>
            <ArrowLeft size={18} />
          </button>
        ) : (
          <button type="button" className="icon-button" aria-label="Open navigation menu" onClick={() => setMenuOpen((value) => !value)}>
            <Menu size={18} />
          </button>
        )}
      </div>

      <div className="brand-panel">
        <span className="brand-label">{title}</span>
        <span className="brand-time">
          <Clock3 size={12} /> {F({ dateStyle: "medium", timeStyle: "short", hour12: true }).format(now)}
        </span>
      </div>

      <div className="topbar-right">
        {showLock && (
          <button type="button" className="icon-button" aria-label="Lock now" onClick={() => void lockApp()}>
            <Lock size={18} />
          </button>
        )}
      </div>

      {!showBack && menuOpen && (
        <nav className="drawer glass" aria-label="Main navigation">
          <Link to="/" onClick={() => setMenuOpen(false)}><Shield size={16} /> Home</Link>
          <Link to="/" onClick={() => { setActiveConversationId(null); setMenuOpen(false); }}><Plus size={16} /> New Chat</Link>
          <Link to="/history" onClick={() => setMenuOpen(false)}><Clock3 size={16} /> History</Link>
          <Link to="/api-config" onClick={() => setMenuOpen(false)}><Shield size={16} /> API Config</Link>
          <Link to="/settings" onClick={() => setMenuOpen(false)}><Menu size={16} /> Settings</Link>
          <Link to="/about" onClick={() => setMenuOpen(false)}><ArrowLeft size={16} /> About</Link>
        </nav>
      )}
    </header>
  );
}
