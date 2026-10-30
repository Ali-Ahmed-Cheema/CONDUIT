import { Bot, Clock3, Info, KeyRound, Menu, Plus, Settings, Sparkles } from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { GlassTabBar, HelpButton, type GlassTab } from "@conduit/ui";
import { useAppStore } from "../store";

interface HeaderProps {
  title: string;
  showBack?: boolean;
}

export function Header({ title }: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const setActiveConversationId = useAppStore((state) => state.setActiveConversationId);
  const location = useLocation();
  const tabs: GlassTab[] = [
    { href: "/", label: "New chat", icon: <Plus size={20} />, current: location.pathname === "/", onClick: () => setActiveConversationId(null) },
    { href: "/history", label: "History", icon: <Clock3 size={20} />, current: location.pathname === "/history" },
    { href: "/api-config", label: "Connect AI", icon: <Sparkles size={20} />, current: location.pathname === "/api-config" },
    { href: "/settings", label: "Settings", icon: <Settings size={20} />, current: location.pathname === "/settings" },
  ];

  return (
    <header className="topbar">
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <div className="brand-panel">
        <span className="brand-label">{title}</span>
      </div>
      <GlassTabBar tabs={tabs} className="workspace-nav glass">
        <button type="button" aria-expanded={menuOpen} aria-controls="more-navigation" onClick={() => setMenuOpen((value) => !value)}>
          <Menu size={20} /><span>More</span>
        </button>
        {menuOpen && (
          <div className="more-menu glass" id="more-navigation">
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
