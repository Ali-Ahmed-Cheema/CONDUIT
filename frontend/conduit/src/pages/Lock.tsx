import { useEffect, useMemo, useState } from "react";
import { Eye, EyeOff, LockKeyhole } from "lucide-react";
import { getLockoutRemainingSeconds, isLockoutActive, resetLockoutState, verifyPassword, bumpLockout, deriveDataKey } from "../crypto/lockout";
import { readVault } from "../crypto/vault";
import { useAppStore } from "../store";
import { greeting } from "../lib/time";

export function LockPage() {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [remaining, setRemaining] = useState(getLockoutRemainingSeconds());

  const active = useMemo(() => isLockoutActive(), [remaining]);

  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setRemaining(getLockoutRemainingSeconds()), 1000);
    return () => window.clearInterval(timer);
  }, [active]);

  const handleUnlock = async () => {
    if (busy || active) return;
    setBusy(true);
    setError("");

    try {
      const ok = await verifyPassword(password);
      if (!ok) {
        const until = bumpLockout();
        const nextRemaining = Math.max(0, Math.ceil((until - Date.now()) / 1000));
        setRemaining(nextRemaining);
        setError("Incorrect password. Access denied.");
        setBusy(false);
        return;
      }

      const dataKey = await deriveDataKey(password);
      const saved = await readVault(dataKey);
      const settings = saved.settings;
      useAppStore.getState().setDataKey(dataKey);
      useAppStore.getState().setUnlocked(true);
      useAppStore.getState().setKeys([]);
      useAppStore.getState().setConversations(saved.chats as import("../store").ChatConversation[]);
      if (settings.theme === "light" || settings.theme === "dark" || settings.theme === "system") {
        useAppStore.getState().setTheme(settings.theme);
      }
      if (typeof settings.soundOn === "boolean") useAppStore.getState().setSoundOn(settings.soundOn);
      if (typeof settings.autoLockMinutes === "number" && settings.autoLockMinutes >= 0) {
        useAppStore.getState().setAutoLockMinutes(settings.autoLockMinutes);
      }
      useAppStore.getState().setActiveKeyId(null);
      useAppStore.getState().setActiveModel("");
      resetLockoutState();
      setPassword("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not unlock the local vault.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="lock-screen">
      <div className="lock-card glass">
        <div className="lock-header">
          <div className="lock-icon"><LockKeyhole size={18} /></div>
          <div>
            <h1>CONDUIT V3.0</h1>
          </div>
        </div>

        <p className="welcome-line">Welcome! {greeting().replace("Good ", "").replace(", Ali", "")}</p>

        <div className="password-wrap">
          <input
            aria-label="Password"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void handleUnlock();
              }
            }}
            placeholder="Password"
            disabled={active || busy}
          />
          <button type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((value) => !value)}>
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>

        <button type="button" className="primary-button" onClick={() => void handleUnlock()} disabled={busy || active || password.length === 0}>
          {busy ? "Unlocking..." : "Unlock"}
        </button>

        {active && remaining > 0 && <p className="lockout-note">Locked for {remaining}s</p>}
        {error && <p role="alert" className="error-alert">{error}</p>}
      </div>
    </div>
  );
}
