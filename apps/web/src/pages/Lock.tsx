import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Eye, EyeOff, LockKeyhole } from "lucide-react";
import {
  bumpLockout,
  createVaultCredentials,
  deriveDataKey,
  getLockoutRemainingSeconds,
  initializeLockoutState,
  isLockoutActive,
  resetLockoutState,
  verifyPassword,
} from "../crypto/lockout";
import { LEGACY_VAULT_SETUP } from "../crypto/legacyConfig";
import {
  getVaultSetup,
  hasVaultData,
  initializeVault,
  mergeVaultData,
  readExistingDeviceVault,
  readVault,
  writeVault,
  type VaultData,
  type VaultSetup,
} from "@conduit/storage";
import { GlassPanel, HelpButton } from "@conduit/ui";
import { readUiPreferences, useAppStore, type ChatConversation } from "../store";
import { greeting } from "../lib/time";

type LockMode = "loading" | "error" | "setup" | "legacy" | "unlock";

function passwordStrength(password: string): string {
  if (password.length < 12) return "Weak — use at least 12 characters.";
  const variety = [
    /[a-z]/.test(password),
    /[A-Z]/.test(password),
    /\d/.test(password),
    /[^a-zA-Z0-9]/.test(password),
  ].filter(Boolean).length;
  return variety >= 3 || password.length >= 20 ? "Strong" : "Fair — add more character types.";
}

function activateVault(dataKey: CryptoKey, saved: VaultData) {
  const settings = saved.settings;
  useAppStore.getState().setDataKey(dataKey);
  useAppStore.getState().setUnlocked(true);
  useAppStore.getState().setKeys([]);
  useAppStore.getState().setConversations(saved.chats as ChatConversation[]);
  if (settings.theme === "light" || settings.theme === "dark" || settings.theme === "system") {
    useAppStore.getState().setTheme(settings.theme);
  }
  if (typeof settings.soundOn === "boolean") useAppStore.getState().setSoundOn(settings.soundOn);
  if (typeof settings.autoLockMinutes === "number" && settings.autoLockMinutes >= 0) {
    useAppStore.getState().setAutoLockMinutes(settings.autoLockMinutes);
  }
  if (settings.preferences !== undefined) {
    useAppStore.getState().setPreferences(readUiPreferences(settings.preferences));
  }
  useAppStore.getState().setActiveKeyId(null);
  useAppStore.getState().setActiveModel("");
}

export function LockPage() {
  const [mode, setMode] = useState<LockMode>("loading");
  const [setup, setSetup] = useState<VaultSetup | null>(null);
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [remaining, setRemaining] = useState(getLockoutRemainingSeconds());

  const active = useMemo(() => isLockoutActive(), [remaining]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([getVaultSetup(), hasVaultData(), initializeLockoutState()])
      .then(([savedSetup, hasData]) => {
        if (cancelled) return;
        setSetup(savedSetup);
        setMode(savedSetup ? "unlock" : hasData ? "legacy" : "setup");
        setRemaining(getLockoutRemainingSeconds());
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : "Could not read the local vault.");
          setMode("error");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setRemaining(getLockoutRemainingSeconds()), 1000);
    return () => window.clearInterval(timer);
  }, [active]);

  const handleUnlock = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || active || mode === "loading") return;
    setBusy(true);
    setError("");

    try {
      if (mode === "setup" || mode === "legacy") {
        if (newPassword.length < 12) throw new Error("Choose a password with at least 12 characters.");
        if (newPassword !== confirmation) throw new Error("The new passwords do not match.");
      }

      if (mode === "legacy" && !(await verifyPassword(password, LEGACY_VAULT_SETUP))) {
        const until = await bumpLockout();
        setRemaining(Math.max(0, Math.ceil((until - Date.now()) / 1000)));
        setError("Incorrect existing password. Access denied.");
        return;
      }

      if (mode === "setup") {
        const credentials = await createVaultCredentials(newPassword);
        const emptyVault: VaultData = { version: 1, keys: [], chats: [], settings: {} };
        await initializeVault(credentials.dataKey, emptyVault, credentials.setup);
        setSetup(credentials.setup);
        activateVault(credentials.dataKey, emptyVault);
        await resetLockoutState();
        return;
      }

      if (mode === "legacy") {
        const oldDataKey = await deriveDataKey(password, LEGACY_VAULT_SETUP.saltData);
        const [saved, deviceData] = await Promise.all([
          readVault(oldDataKey),
          readExistingDeviceVault(),
        ]);
        const migrated = deviceData ? mergeVaultData(deviceData, saved) : saved;
        const credentials = await createVaultCredentials(newPassword);
        await initializeVault(credentials.dataKey, migrated, credentials.setup);
        setSetup(credentials.setup);
        activateVault(credentials.dataKey, migrated);
        await resetLockoutState();
        return;
      }

      if (!setup || !(await verifyPassword(password, setup))) {
        const until = await bumpLockout();
        setRemaining(Math.max(0, Math.ceil((until - Date.now()) / 1000)));
        setError("Incorrect password. Access denied.");
        return;
      }

      const dataKey = await deriveDataKey(password, setup.saltData);
      const saved = await readVault(dataKey);
      const deviceData = await readExistingDeviceVault();
      const merged = deviceData ? mergeVaultData(deviceData, saved) : saved;
      if (deviceData && (deviceData.keys.length || deviceData.chats.length || Object.keys(deviceData.settings).length)) {
        await writeVault(dataKey, merged);
      }
      activateVault(dataKey, merged);
      await resetLockoutState();
      setPassword("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not unlock the local vault.");
    } finally {
      setBusy(false);
    }
  };

  const title = mode === "error"
    ? "Private space unavailable"
    : mode === "setup"
      ? "Set up your vault"
      : mode === "legacy"
        ? "Upgrade your vault"
        : "Your private space";
  const primaryLabel = mode === "setup" ? "Create vault" : mode === "legacy" ? "Migrate vault" : "Unlock";

  return (
    <main id="main-content" className="lock-screen">
      <GlassPanel className="lock-card">
        <div className="lock-header">
          <div className="lock-icon"><LockKeyhole size={18} /></div>
          <div><h1>{title}</h1></div>
        </div>

        {mode !== "loading" && mode !== "error" && (
          <>
            <p className="welcome-line">
              {mode === "legacy"
                ? "Enter your existing password and choose a new one. Your old vault is kept intact unless migration succeeds."
                : mode === "setup"
                  ? "Choose a password. It protects your chats saved on this device."
                  : `Welcome! ${greeting().replace("Good ", "").replace(", Ali", "")}`}
            </p>
            <form onSubmit={(event) => void handleUnlock(event)}>
              <div className="password-wrap">
                <input
                  aria-label={mode === "legacy" ? "Existing password" : "Password"}
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={mode === "legacy" ? "Existing password" : "Password"}
                  autoComplete={mode === "legacy" ? "current-password" : "current-password"}
                  disabled={active || busy}
                  required
                />
                <button type="button" onClick={() => setShowPassword((value) => !value)}>
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  {showPassword ? "Hide password" : "Show password"}
                </button>
              </div>
              {(mode === "setup" || mode === "legacy") && (
                <>
                  <div className="password-wrap">
                    <input
                      aria-label="New password"
                      type="password"
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                      placeholder="New password"
                      autoComplete="new-password"
                      disabled={active || busy}
                      minLength={12}
                      required
                    />
                  </div>
                  <p className="welcome-line">{passwordStrength(newPassword)}</p>
                  <div className="password-wrap">
                    <input
                      aria-label="Confirm new password"
                      type="password"
                      value={confirmation}
                      onChange={(event) => setConfirmation(event.target.value)}
                      placeholder="Confirm new password"
                      autoComplete="new-password"
                      disabled={active || busy}
                      minLength={12}
                      required
                    />
                  </div>
                </>
              )}
              <button type="submit" className="primary-button" disabled={busy || active}>
                {busy ? "Working..." : primaryLabel}
              </button>
            </form>
          </>
        )}

        {active && remaining > 0 && <p className="lockout-note">You can try again in {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}</p>}
        {error && <p role="alert" className="error-alert">{error}</p>}
        <HelpButton screen="Lock" />
      </GlassPanel>
    </main>
  );
}
