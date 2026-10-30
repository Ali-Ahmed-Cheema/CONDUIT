import { useState, type FormEvent } from "react";
import { clearConnections } from "../api";
import { Header } from "../components/Header";
import {
  createVaultCredentials,
  deriveDataKey,
  resetLockoutState,
  verifyPassword,
} from "../crypto/lockout";
import {
  clearVault,
  getVaultSetup,
  initializeVault,
  readVault,
  writeVault,
} from "../crypto/vault";
import {
  createVaultBackup,
  mergeVaultData,
  readVaultBackup,
} from "../crypto/vaultBackup";
import { lockApp } from "../lib/lock";
import { useAppStore, type ChatConversation } from "../store";

export function SettingsPage() {
  const theme = useAppStore((state) => state.theme);
  const soundOn = useAppStore((state) => state.soundOn);
  const autoLockMinutes = useAppStore((state) => state.autoLockMinutes);
  const setTheme = useAppStore((state) => state.setTheme);
  const setSoundOn = useAppStore((state) => state.setSoundOn);
  const setAutoLockMinutes = useAppStore((state) => state.setAutoLockMinutes);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [backupPassword, setBackupPassword] = useState("");
  const [backupFile, setBackupFile] = useState<File | null>(null);
  const [importMode, setImportMode] = useState<"merge" | "replace">("merge");
  const [backupError, setBackupError] = useState("");
  const [backupMessage, setBackupMessage] = useState("");
  const [backupBusy, setBackupBusy] = useState(false);

  const clearData = async () => {
    if (!window.confirm("Clear all local chat data and saved API connections? This cannot be undone.")) return;
    setBusy(true);
    setError("");
    try {
      await clearConnections();
      await clearVault();
      await resetLockoutState();
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

  const changePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPasswordError("");
    setPasswordMessage("");
    if (newPassword.length < 12) {
      setPasswordError("Choose a password with at least 12 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("The new passwords do not match.");
      return;
    }

    setPasswordBusy(true);
    try {
      const currentSetup = await getVaultSetup();
      if (!currentSetup || !(await verifyPassword(currentPassword, currentSetup))) {
        throw new Error("The current password is incorrect.");
      }
      const oldKey = await deriveDataKey(currentPassword, currentSetup.saltData);
      const saved = await readVault(oldKey);
      const next = await createVaultCredentials(newPassword);
      await initializeVault(next.dataKey, saved, next.setup);
      useAppStore.getState().setDataKey(next.dataKey);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordMessage("Password changed. Your existing vault was re-encrypted.");
    } catch (reason) {
      setPasswordError(reason instanceof Error ? reason.message : "Could not change the vault password.");
    } finally {
      setPasswordBusy(false);
    }
  };

  const exportBackup = async () => {
    setBackupError("");
    setBackupMessage("");
    setBackupBusy(true);
    try {
      const setup = await getVaultSetup();
      if (!setup || !(await verifyPassword(backupPassword, setup))) {
        throw new Error("Enter the current vault password to export a backup.");
      }
      const dataKey = await deriveDataKey(backupPassword, setup.saltData);
      const saved = await readVault(dataKey);
      const serialized = await createVaultBackup(saved, backupPassword);
      const url = URL.createObjectURL(new Blob([serialized], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "conduit-vault.conduit-vault.json";
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setBackupMessage("Encrypted vault backup downloaded.");
    } catch (reason) {
      setBackupError(reason instanceof Error ? reason.message : "Could not export the vault backup.");
    } finally {
      setBackupBusy(false);
    }
  };

  const importBackup = async () => {
    setBackupError("");
    setBackupMessage("");
    if (!backupFile) {
      setBackupError("Choose a backup file first.");
      return;
    }
    if (importMode === "replace" && !window.confirm("Replace all current chats and settings with this backup?")) return;

    setBackupBusy(true);
    try {
      const dataKey = useAppStore.getState().dataKey;
      if (!dataKey) throw new Error("Unlock the vault before importing a backup.");
      const imported = await readVaultBackup(await backupFile.text(), backupPassword);
      const current = await readVault(dataKey);
      const next = importMode === "merge" ? mergeVaultData(current, imported) : imported;
      await writeVault(dataKey, next);
      useAppStore.getState().setConversations(next.chats as ChatConversation[]);
      const firstConversation = next.chats[0] as ChatConversation | undefined;
      useAppStore.getState().setActiveConversationId(
        firstConversation && typeof firstConversation.id === "string" ? firstConversation.id : null,
      );
      if (next.settings.theme === "light" || next.settings.theme === "dark" || next.settings.theme === "system") {
        setTheme(next.settings.theme);
      }
      if (typeof next.settings.soundOn === "boolean") setSoundOn(next.settings.soundOn);
      if (typeof next.settings.autoLockMinutes === "number" && next.settings.autoLockMinutes >= 0) {
        setAutoLockMinutes(next.settings.autoLockMinutes);
      }
      setBackupFile(null);
      setBackupPassword("");
      setBackupMessage(importMode === "merge" ? "Backup merged into this vault." : "Vault restored from backup.");
    } catch (reason) {
      setBackupError(reason instanceof Error ? reason.message : "Could not import the vault backup.");
    } finally {
      setBackupBusy(false);
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

        <section className="settings-block glass">
          <h3>Change vault password</h3>
          <form onSubmit={(event) => void changePassword(event)}>
            <label>
              Current password
              <input type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required />
            </label>
            <label>
              New password
              <input type="password" autoComplete="new-password" minLength={12} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required />
            </label>
            <label>
              Confirm new password
              <input type="password" autoComplete="new-password" minLength={12} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required />
            </label>
            <button type="submit" className="secondary-button" disabled={passwordBusy}>{passwordBusy ? "Changing..." : "Change password"}</button>
          </form>
          {passwordError && <p className="error-alert" role="alert">{passwordError}</p>}
          {passwordMessage && <p role="status">{passwordMessage}</p>}
        </section>

        <section className="settings-block glass">
          <h3>Encrypted vault backup</h3>
          <p>Backups are encrypted with your current vault password.</p>
          <label>
            Vault password
            <input type="password" autoComplete="current-password" value={backupPassword} onChange={(event) => setBackupPassword(event.target.value)} />
          </label>
          <button type="button" className="secondary-button" onClick={() => void exportBackup()} disabled={backupBusy}>
            {backupBusy ? "Working..." : "Export encrypted backup"}
          </button>
          <label>
            Import backup file
            <input type="file" accept=".json,.conduit-vault.json,application/json" onChange={(event) => setBackupFile(event.target.files?.[0] ?? null)} />
          </label>
          <label>
            Import behavior
            <select value={importMode} onChange={(event) => setImportMode(event.target.value === "replace" ? "replace" : "merge")}>
              <option value="merge">Merge chats and settings</option>
              <option value="replace">Replace chats and settings</option>
            </select>
          </label>
          <button type="button" className="secondary-button" onClick={() => void importBackup()} disabled={backupBusy}>
            {backupBusy ? "Working..." : "Import encrypted backup"}
          </button>
          {backupError && <p className="error-alert" role="alert">{backupError}</p>}
          {backupMessage && <p role="status">{backupMessage}</p>}
        </section>

        <p>Lockout delays are a local UX guardrail, not a security boundary.</p>
        <section className="settings-block glass action-block">
          <button type="button" className="secondary-button" onClick={() => void lockApp()} disabled={busy}>Lock now</button>
          <button type="button" className="danger-button" onClick={() => void clearData()} disabled={busy}>{busy ? "Clearing..." : "Clear all data"}</button>
        </section>
      </main>
    </div>
  );
}
