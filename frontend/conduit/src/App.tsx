import { Suspense, lazy, useEffect } from "react";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { useAppStore } from "./store";
import { LockPage } from "./pages/Lock";
import { writeVault } from "./crypto/vault";
import { lockApp } from "./lib/lock";

const ChatPage = lazy(() => import("./pages/Chat").then((module) => ({ default: module.ChatPage })));
const HistoryPage = lazy(() => import("./pages/History").then((module) => ({ default: module.HistoryPage })));
const ApiConfigPage = lazy(() => import("./pages/ApiConfig").then((module) => ({ default: module.ApiConfigPage })));
const SettingsPage = lazy(() => import("./pages/Settings").then((module) => ({ default: module.SettingsPage })));
const AboutPage = lazy(() => import("./pages/About").then((module) => ({ default: module.AboutPage })));
const CredentialsPage = lazy(() => import("./pages/Credentials").then((module) => ({ default: module.CredentialsPage })));

async function persistVault(setVaultError: (message: string | null) => void) {
  const state = useAppStore.getState();
  if (!state.unlocked || !state.dataKey) return;
  try {
    await writeVault(state.dataKey, {
      chats: state.conversations,
      settings: {
        theme: state.theme,
        soundOn: state.soundOn,
        autoLockMinutes: state.autoLockMinutes,
      },
    });
    setVaultError(null);
  } catch (error) {
    setVaultError(error instanceof Error ? `Could not save encrypted local data: ${error.message}` : "Could not save encrypted local data.");
  }
}

function AppShell() {
  const unlocked = useAppStore((state) => state.unlocked);
  const theme = useAppStore((state) => state.theme);
  const soundOn = useAppStore((state) => state.soundOn);
  const autoLockMinutes = useAppStore((state) => state.autoLockMinutes);
  const conversations = useAppStore((state) => state.conversations);
  const dataKey = useAppStore((state) => state.dataKey);
  const setVaultError = useAppStore((state) => state.setVaultError);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const applyTheme = () => {
      const selectedTheme = theme === "system" ? (media.matches ? "dark" : "light") : theme;
      document.documentElement.dataset.t = selectedTheme;
    };
    applyTheme();
    media.addEventListener("change", applyTheme);
    return () => media.removeEventListener("change", applyTheme);
  }, [theme]);

  useEffect(() => {
    const viewport = window.visualViewport;
    const updateViewportHeight = () => {
      const height = viewport?.height ?? window.innerHeight;
      document.documentElement.style.setProperty("--app-viewport-height", `${height}px`);
    };
    updateViewportHeight();
    viewport?.addEventListener("resize", updateViewportHeight);
    window.addEventListener("resize", updateViewportHeight);
    return () => {
      viewport?.removeEventListener("resize", updateViewportHeight);
      window.removeEventListener("resize", updateViewportHeight);
      document.documentElement.style.removeProperty("--app-viewport-height");
    };
  }, []);

  useEffect(() => {
    if (!unlocked || !dataKey) return;
    const timer = window.setTimeout(() => void persistVault(setVaultError), 300);
    const flushWhenHidden = () => {
      if (document.visibilityState === "hidden") void persistVault(setVaultError);
    };
    const flushOnPageHide = () => void persistVault(setVaultError);
    document.addEventListener("visibilitychange", flushWhenHidden);
    window.addEventListener("pagehide", flushOnPageHide);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", flushWhenHidden);
      window.removeEventListener("pagehide", flushOnPageHide);
    };
  }, [unlocked, dataKey, conversations, theme, soundOn, autoLockMinutes, setVaultError]);

  useEffect(() => {
    if (!unlocked || autoLockMinutes <= 0) return;
    let timer = 0;
    const lockAfterInactivity = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void lockApp(), autoLockMinutes * 60_000);
    };
    lockAfterInactivity();
    window.addEventListener("pointerdown", lockAfterInactivity);
    window.addEventListener("keydown", lockAfterInactivity);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pointerdown", lockAfterInactivity);
      window.removeEventListener("keydown", lockAfterInactivity);
    };
  }, [unlocked, autoLockMinutes]);

  if (!unlocked) {
    return <LockPage />;
  }

  return (
    <Suspense fallback={<div className="shell-loading">Loading...</div>}>
      <Routes>
        <Route path="/" element={<ChatPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/api-config" element={<ApiConfigPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/credentials" element={<CredentialsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <HashRouter>
      <AppShell />
    </HashRouter>
  );
}
