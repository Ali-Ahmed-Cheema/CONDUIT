import { useState } from "react";
import { clearConnections } from "../api";
import { Header } from "../components/Header";
import { GlassButton, GlassDialog, GlassInput, GlassPanel, GlassToggle } from "@conduit/ui";
import {
  clearVault,
  readDeviceVault,
  writeDeviceVault,
} from "@conduit/storage";
import {
  createVaultBackup,
  mergeVaultData,
  readVaultBackup,
} from "../crypto/vaultBackup";
import { defaultUiPreferences, readUiPreferences, useAppStore, type ChatConversation } from "../store";

export function SettingsPage() {
  const theme = useAppStore((state) => state.theme);
  const soundOn = useAppStore((state) => state.soundOn);
  const setTheme = useAppStore((state) => state.setTheme);
  const setSoundOn = useAppStore((state) => state.setSoundOn);
  const setAutoLockMinutes = useAppStore((state) => state.setAutoLockMinutes);
  const preferences = useAppStore((state) => state.preferences);
  const setPreferences = useAppStore((state) => state.setPreferences);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [backupPassword, setBackupPassword] = useState("");
  const [backupFile, setBackupFile] = useState<File | null>(null);
  const [importMode, setImportMode] = useState<"merge" | "replace">("merge");
  const [backupError, setBackupError] = useState("");
  const [backupMessage, setBackupMessage] = useState("");
  const [backupBusy, setBackupBusy] = useState(false);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [deleteText, setDeleteText] = useState("");

  const clearData = async () => {
    if (deleteText !== "DELETE") return;
    setBusy(true);
    setError("");
    try {
      await clearConnections();
      await clearVault();
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
        preferences: defaultUiPreferences,
      });
      setClearConfirmOpen(false);
      setDeleteText("");
    } catch (reason) {
      setError(`Could not finish clearing all data: ${reason instanceof Error ? reason.message : "an unknown error occurred."}`);
    } finally {
      setBusy(false);
    }
  };

  const exportBackup = async () => {
    setBackupError("");
    setBackupMessage("");
    setBackupBusy(true);
    try {
      if (backupPassword.length < 12) throw new Error("Choose a backup password with at least 12 characters.");
      const dataKey = useAppStore.getState().dataKey;
      if (!dataKey) throw new Error("The local workspace is not ready.");
      const saved = await readDeviceVault(dataKey);
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
      if (!dataKey) throw new Error("The local workspace is not ready.");
      const imported = await readVaultBackup(await backupFile.text(), backupPassword);
      const current = await readDeviceVault(dataKey);
      const next = importMode === "merge" ? mergeVaultData(current, imported) : imported;
      await writeDeviceVault(dataKey, next);
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
      if (next.settings.preferences !== undefined) {
        useAppStore.getState().setPreferences(readUiPreferences(next.settings.preferences));
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
      <main id="main-content" className="settings-page">
        <h1 className="sr-only">Settings</h1>
        {error && <p className="error-alert" role="alert">{error}</p>}
        <GlassPanel className="settings-block">
          <h2>Theme</h2>
          <div className="segmented">
            <button type="button" className={theme === "light" ? "active" : ""} aria-pressed={theme === "light"} onClick={() => setTheme("light")}>Light</button>
            <button type="button" className={theme === "dark" ? "active" : ""} aria-pressed={theme === "dark"} onClick={() => setTheme("dark")}>Dark</button>
            <button type="button" className={theme === "system" ? "active" : ""} aria-pressed={theme === "system"} onClick={() => setTheme("system")}>Automatic</button>
          </div>
        </GlassPanel>

        <GlassPanel className="settings-block look-feel-settings">
          <h2>Text size</h2>
          <div className="segmented">
            {(["normal", "large", "extra-large"] as const).map((size) => (
              <button
                type="button"
                key={size}
                className={preferences.textSize === size ? "active" : ""}
                aria-pressed={preferences.textSize === size}
                onClick={() => setPreferences({ textSize: size })}
              >
                {size === "extra-large" ? "Extra Large" : size === "large" ? "Large" : "Normal"}
              </button>
            ))}
          </div>
          <p className="settings-text-preview">The text size changes across the whole workspace.</p>
          <GlassToggle label="Simple Mode" checked={preferences.simpleMode} onChange={(simpleMode) => setPreferences({ simpleMode })} />
          <GlassToggle label="Reduce motion" checked={preferences.reduceMotion} onChange={(reduceMotion) => setPreferences({ reduceMotion })} />
          <GlassToggle
            label="Reduce transparency"
            checked={preferences.reduceTransparency}
            onChange={(reduceTransparency) => setPreferences({ reduceTransparency })}
          />
          <GlassToggle label="High contrast" checked={preferences.highContrast} onChange={(highContrast) => setPreferences({ highContrast })} />
        </GlassPanel>

        <GlassPanel className="settings-block">
          <h2>Notification sound</h2>
          <GlassToggle label="Notification sound" checked={soundOn} onChange={setSoundOn} />
        </GlassPanel>

        <GlassPanel className="settings-block">
          <h2>Encrypted vault backup</h2>
          <p>Backups are encrypted with the backup password you choose.</p>
          <label>
            Backup password
            <input type="password" autoComplete="off" value={backupPassword} onChange={(event) => setBackupPassword(event.target.value)} />
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
        </GlassPanel>

        <GlassPanel className="settings-block action-block">
          <h2>Danger Zone</h2>
          <p>Clearing data removes all chats, saved AI keys, and settings from this device.</p>
          <button type="button" className="danger-button" onClick={() => setClearConfirmOpen(true)} disabled={busy}>Clear all data</button>
        </GlassPanel>
      </main>
      <GlassDialog
        open={clearConfirmOpen}
        title="Clear all data?"
        onClose={() => {
          setClearConfirmOpen(false);
          setDeleteText("");
        }}
      >
        <p>This will remove all chats, saved AI keys, and settings from this device. You cannot undo this.</p>
        <details className="advanced-confirmation">
          <summary>Advanced confirmation</summary>
          <GlassInput
            label="Type DELETE to confirm"
            autoComplete="off"
            value={deleteText}
            onChange={(event) => setDeleteText(event.target.value)}
          />
        </details>
        <div className="dialog-actions">
          <GlassButton onClick={() => {
            setClearConfirmOpen(false);
            setDeleteText("");
          }}>Cancel</GlassButton>
          <GlassButton variant="danger" onClick={() => void clearData()} disabled={busy || deleteText !== "DELETE"}>
            {busy ? "Clearing..." : "Clear data"}
          </GlassButton>
        </div>
      </GlassDialog>
    </div>
  );
}
