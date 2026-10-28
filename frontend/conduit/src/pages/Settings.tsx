import { useState } from "react";
import { clearConnections } from "../api";
import { Header } from "../components/Header";
import { clearVault } from "../crypto/vault";
import { lockApp } from "../lib/lock";
import { useAppStore } from "../store";

export function SettingsPage() {
  const theme = useAppStore((state) => state.theme);
  const soundOn = useAppStore((state) => state.soundOn);
  const autoLockMinutes = useAppStore((state) => state.autoLockMinutes);
  const setTheme = useAppStore((state) => state.setTheme);
  const setSoundOn = useAppStore((state) => state.setSoundOn);
  const setAutoLockMinutes = useAppStore((state) => state.setAutoLockMinutes);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const clearData = async () => {
    if (!window.confirm("Clear all local chat data and saved API connections? This cannot be undone.")) return;
    setBusy(true);
    setError("");
    try {
      await clearConnections();
      await clearVault();
      localStorage.removeItem("conduit-lockout");
      useAppStore.setState({
        keys: [],
        connections: [],
        activeConnectionId: null,
        conversations: [],
        activeConversationId: null,
        activeKeyId: null,
        activeModel: "",
        vaultError: null,
        theme: "light",
        soundOn: true,
        autoLockMinutes: 5,
      });
    } catch (reason) {
      setError(`Could not finish clearing all data: ${reason instanceof Error ? reason.message : "an unknown error occurred."}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page-shell">
      <Header title="Settings" showBack />
      <main className="settings-page">
        {error && <p className="error-alert" role="alert">{error}</p>}
        <section className="settings-block glass">
          <h3>Theme</h3>
          <div className="segmented">
            <button type="button" className={theme === "light" ? "active" : ""} aria-pressed={theme === "light"} onClick={() => setTheme("light")}>Light</button>
            <button type="button" className={theme === "dark" ? "active" : ""} aria-pressed={theme === "dark"} onClick={() => setTheme("dark")}>Dark</button>
            <button type="button" className={theme === "system" ? "active" : ""} aria-pressed={theme === "system"} onClick={() => setTheme("system")}>System</button>
          </div>
        </section>

        <section className="settings-block glass">
          <h3>Notification sound</h3>
          <button type="button" className="toggle" aria-pressed={soundOn} onClick={() => setSoundOn(!soundOn)}>{soundOn ? "On" : "Off"}</button>
        </section>

        <section className="settings-block glass">
          <h3>Auto-lock</h3>
          <div className="segmented">
            {[1, 5, 15, 0].map((value) => (
              <button key={value} type="button" className={autoLockMinutes === value ? "active" : ""} aria-pressed={autoLockMinutes === value} onClick={() => setAutoLockMinutes(value)}>
                {value === 0 ? "Never" : `${value} min`}
              </button>
            ))}
          </div>
        </section>

        <section className="settings-block glass action-block">
          <button type="button" className="secondary-button" onClick={() => void lockApp()} disabled={busy}>Lock now</button>
          <button type="button" className="danger-button" onClick={() => void clearData()} disabled={busy}>{busy ? "Clearing..." : "Clear all data"}</button>
        </section>
      </main>
    </div>
  );
}
