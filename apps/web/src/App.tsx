import { Suspense, lazy, useEffect, useState } from "react";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { readUiPreferences, useAppStore } from "./store";
import { openDeviceVault, writeDeviceVault } from "@conduit/storage";
import { CommandPalette } from "./components/CommandPalette";
import { normalizeUserMemories } from "./lib/userMemory";

const ChatPage = lazy(() => import("./pages/Chat").then((module) => ({ default: module.ChatPage })));
const HistoryPage = lazy(() => import("./pages/History").then((module) => ({ default: module.HistoryPage })));
const ApiConfigPage = lazy(() => import("./pages/ApiConfig").then((module) => ({ default: module.ApiConfigPage })));
const SettingsPage = lazy(() => import("./pages/Settings").then((module) => ({ default: module.SettingsPage })));
const AboutPage = lazy(() => import("./pages/About").then((module) => ({ default: module.AboutPage })));
const CredentialsPage = lazy(() => import("./pages/Credentials").then((module) => ({ default: module.CredentialsPage })));
const GettingStartedPage = lazy(() => import("./pages/GettingStarted").then((module) => ({ default: module.GettingStartedPage })));

async function persistVault(setVaultError: (message: string | null) => void) {
  const state = useAppStore.getState();
  if (!state.unlocked || !state.dataKey) return;
  try {
    await writeDeviceVault(state.dataKey, {
      chats: state.conversations,
      settings: {
        theme: state.theme,
        soundOn: state.soundOn,
        autoLockMinutes: state.autoLockMinutes,
        preferences: state.preferences,
        userMemories: state.userMemories,
      },
    });
    setVaultError(null);
  } catch (error) {
    setVaultError(error instanceof Error ? `Could not save encrypted local data: ${error.message}` : "Could not save encrypted local data.");
  }
}

function AppShell() {
  const [starting, setStarting] = useState(true);
  const unlocked = useAppStore((state) => state.unlocked);
  const theme = useAppStore((state) => state.theme);
  const soundOn = useAppStore((state) => state.soundOn);
  const autoLockMinutes = useAppStore((state) => state.autoLockMinutes);
  const preferences = useAppStore((state) => state.preferences);
  const conversations = useAppStore((state) => state.conversations);
  const userMemories = useAppStore((state) => state.userMemories);
  const dataKey = useAppStore((state) => state.dataKey);
  const vaultError = useAppStore((state) => state.vaultError);
  const setDataKey = useAppStore((state) => state.setDataKey);
  const setConversations = useAppStore((state) => state.setConversations);
  const setTheme = useAppStore((state) => state.setTheme);
  const setSoundOn = useAppStore((state) => state.setSoundOn);
  const setPreferences = useAppStore((state) => state.setPreferences);
  const setVaultError = useAppStore((state) => state.setVaultError);

  useEffect(() => {
    let cancelled = false;
    void openDeviceVault()
      .then(({ key, data }) => {
        if (cancelled) return;

        setDataKey(key);
        setConversations(data.chats);
        useAppStore.getState().setUserMemories(normalizeUserMemories(data.settings.userMemories));
        if (data.settings.theme === "light" || data.settings.theme === "dark" || data.settings.theme === "system") {
          setTheme(data.settings.theme);
        }
        if (typeof data.settings.soundOn === "boolean") setSoundOn(data.settings.soundOn);
        if (typeof data.settings.autoLockMinutes === "number" && data.settings.autoLockMinutes >= 0) {
          useAppStore.getState().setAutoLockMinutes(data.settings.autoLockMinutes);
        }
        const savedPreferences = data.settings.preferences;
        if (savedPreferences !== undefined) setPreferences(readUiPreferences(savedPreferences));
        useAppStore.getState().setUnlocked(true);
        setVaultError(null);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setVaultError(error instanceof Error ? `Could not open the local workspace: ${error.message}` : "Could not open the local workspace.");
        }
      })
      .finally(() => {
        if (!cancelled) setStarting(false);
      });
    return () => {
      cancelled = true;
    };
  }, [setConversations, setDataKey, setPreferences, setSoundOn, setTheme, setVaultError]);

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
    const root = document.documentElement;
    root.dataset.textSize = preferences.textSize;
    if (preferences.reduceMotion) root.dataset.reduceMotion = "true";
    else delete root.dataset.reduceMotion;
    if (preferences.reduceTransparency) root.dataset.reduceTransparency = "true";
    else delete root.dataset.reduceTransparency;
    if (preferences.highContrast) root.dataset.highContrast = "true";
    else delete root.dataset.highContrast;
  }, [preferences]);

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
  }, [unlocked, dataKey, conversations, userMemories, theme, soundOn, autoLockMinutes, preferences, setVaultError]);

  if (!unlocked) {
    return (
      <div className="shell-loading">
        {starting ? "Opening local workspace..." : (
          <>
            <p className="error-alert" role="alert">{vaultError}</p>
            <button type="button" className="secondary-button" onClick={() => window.location.reload()}>Retry</button>
          </>
        )}
      </div>
    );
  }

  return (
    <Suspense fallback={<div className="shell-loading" role="status" aria-busy="true">Loading your workspace…</div>}>
      <>
        <CommandPalette />
        <Routes>
          <Route path="/" element={<ChatPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/api-config" element={<ApiConfigPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/getting-started" element={<GettingStartedPage />} />
          <Route path="/credentials" element={<CredentialsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </>
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
