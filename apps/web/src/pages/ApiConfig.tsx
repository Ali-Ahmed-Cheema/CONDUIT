import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { Check, RefreshCw, Trash2, Upload, X } from "lucide-react";
import {
  ApiRequestError,
  addConnection,
  getConnections,
  removeConnection,
  refreshConnection,
  replaceConnection,
  setActiveConnection,
  validateKey,
} from "../api";
import { Header } from "../components/Header";
import { GlassCard } from "@conduit/ui";
import type { ConnectionsResponse, ProviderId } from "../types";
import { useAppStore } from "../store";
import { parseApiKeyCsv } from "../lib/apiKeyCsv";

const detectProvider = (key: string): ProviderId | undefined => {
  if (key.startsWith("AIza")) return "google";
  if (key.startsWith("sk-ant-")) return "anthropic";
  if (key.startsWith("sk-or-")) return "openrouter";
  if (key.startsWith("hf_")) return "huggingface";
  if (key.startsWith("gsk_")) return "groq";
  if (key.startsWith("sk-")) return "openai";
  return undefined;
};

const providerNames: Record<ProviderId, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google Gemini",
  groq: "Groq",
  openrouter: "OpenRouter",
  huggingface: "Hugging Face",
  mistral: "Mistral AI",
};

export function ApiConfigPage() {
  const connections = useAppStore((state) => state.connections);
  const setConnections = useAppStore((state) => state.setConnections);
  const activeConnectionId = useAppStore((state) => state.activeConnectionId);
  const activeModel = useAppStore((state) => state.activeModel);
  const setActiveConnectionId = useAppStore((state) => state.setActiveConnectionId);
  const setActiveModel = useAppStore((state) => state.setActiveModel);
  const [draft, setDraft] = useState("");
  const [allowUnknownProbe, setAllowUnknownProbe] = useState(false);
  const [replacingId, setReplacingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [bulkKeys, setBulkKeys] = useState<string[]>([]);
  const [bulkFileName, setBulkFileName] = useState("");
  const [bulkDuplicateCount, setBulkDuplicateCount] = useState(0);
  const [bulkAllowUnknownProbe, setBulkAllowUnknownProbe] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getConnections()
      .then((result) => {
        if (cancelled) return;
        setConnections(result.connections);
        setActiveConnectionId(result.activeId);
        const active = result.connections.find((connection) => connection.id === result.activeId);
        if (active && !active.models.includes(useAppStore.getState().activeModel)) {
          setActiveModel(active.models[0] ?? "");
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load saved API connections.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [setActiveConnectionId, setActiveModel, setConnections]);

  const submitKey = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = draft.trim();
    const hintedProvider = detectProvider(trimmed);
    if (trimmed.length < 8 || trimmed.length > 4096) {
      setError("Enter an AI key between 8 and 4096 characters.");
      return;
    }
    if (!hintedProvider && !allowUnknownProbe) {
      setError("We cannot identify the AI service for this key. Allow a service check to continue.");
      return;
    }

    setBusy(true);
    setError("");
    setStatusMessage("");
    try {
      const saveWithValidation = async () => {
      const validation = await validateKey(trimmed, !hintedProvider && allowUnknownProbe);
        return replacingId
          ? replaceConnection(replacingId, validation.validationId)
          : addConnection(validation.validationId);
      };
      let result: ConnectionsResponse;
      try {
        result = await saveWithValidation();
      } catch (reason) {
        if (!(reason instanceof ApiRequestError) || reason.code !== "VALIDATION_EXPIRED") throw reason;
        result = await saveWithValidation();
      }
      setConnections(result.connections);
      setActiveConnectionId(result.activeId);
      const active = result.connections.find((connection) => connection.id === result.activeId);
      setActiveModel(active?.models[0] ?? "");
      setStatusMessage(active ? `${active.providerName} connection validated and saved.` : "Connection saved.");
      setDraft("");
      setAllowUnknownProbe(false);
      setReplacingId(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The API key could not be validated.");
    } finally {
      setBusy(false);
    }
  };

  const selectCsvFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;

    setError("");
    setStatusMessage("");
    setBulkKeys([]);
    setBulkFileName("");
    setBulkDuplicateCount(0);
    setBulkAllowUnknownProbe(false);
    if (file.size > 1_000_000) {
      setError("Choose a CSV file smaller than 1 MB.");
      return;
    }

    setBusy(true);
    try {
      const parsed = parseApiKeyCsv(await file.text());
      setBulkKeys(parsed.keys);
      setBulkFileName(file.name);
      setBulkDuplicateCount(parsed.duplicateCount);
      setStatusMessage(
        `Found ${parsed.keys.length} unique API key${parsed.keys.length === 1 ? "" : "s"}${parsed.duplicateCount ? `; ${parsed.duplicateCount} duplicate${parsed.duplicateCount === 1 ? "" : "s"} will be skipped` : ""}.`,
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not read the CSV file.");
    } finally {
      setBusy(false);
    }
  };

  const importCsvKeys = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setStatusMessage("");

    const validKeys = bulkKeys.filter((key) => key.length >= 8 && key.length <= 4096);
    const invalidLengthCount = bulkKeys.length - validKeys.length;
    const availableSlots = Math.max(0, 10 - useAppStore.getState().connections.length);
    if (availableSlots === 0) {
      setError("You can save up to 10 API connections. Delete a connection before importing more.");
      return;
    }

    const keysToImport = validKeys.slice(0, availableSlots);
    const skippedForLimit = validKeys.length - keysToImport.length;
    if (keysToImport.some((key) => !detectProvider(key)) && !bulkAllowUnknownProbe) {
      setError("Allow a service check before importing keys with an unrecognized format.");
      return;
    }
    if (keysToImport.length === 0) {
      setError("No API keys with a supported length are available to import.");
      return;
    }

    setBusy(true);
    let savedCount = 0;
    let failedCount = invalidLengthCount;
    let attemptedCount = 0;
    let stopReason: "rate-limit" | "provider-error" | null = null;
    try {
      for (const key of keysToImport) {
        try {
          const validation = await validateKey(key, !detectProvider(key) && bulkAllowUnknownProbe);
          let result: ConnectionsResponse;
          try {
            result = await addConnection(validation.validationId);
          } catch (reason) {
            if (!(reason instanceof ApiRequestError) || reason.code !== "VALIDATION_EXPIRED") throw reason;
            const retryValidation = await validateKey(key, !detectProvider(key) && bulkAllowUnknownProbe);
            result = await addConnection(retryValidation.validationId);
          }

          setConnections(result.connections);
          setActiveConnectionId(result.activeId);
          const active = result.connections.find((connection) => connection.id === result.activeId);
          setActiveModel(active?.models[0] ?? "");
          savedCount += 1;
        } catch (reason) {
          failedCount += 1;
          if (reason instanceof ApiRequestError && reason.status === 429) {
            stopReason = "rate-limit";
          } else if (!(reason instanceof ApiRequestError) || (reason.status ?? 0) >= 500) {
            stopReason = "provider-error";
          }
        }

        attemptedCount += 1;
        setStatusMessage(`Checking CSV keys: ${attemptedCount}/${keysToImport.length} checked · ${savedCount} added · ${failedCount} not added.`);
        if (stopReason) break;
      }

      const notCheckedCount = keysToImport.length - attemptedCount;
      const summary = [
        `${savedCount} added`,
        `${failedCount} not added`,
        `${bulkDuplicateCount} duplicate${bulkDuplicateCount === 1 ? "" : "s"} skipped`,
        `${skippedForLimit} skipped because the 10-connection limit was reached`,
        `${notCheckedCount} not checked`,
      ];
      setStatusMessage(
        `CSV import complete: ${summary.join("; ")}${stopReason === "rate-limit"
          ? ". Provider rate limit reached; wait before trying the remaining keys."
          : stopReason === "provider-error"
            ? ". A provider or network error stopped the import; try the remaining keys later."
            : "."}`,
      );
      setBulkKeys([]);
      setBulkFileName("");
      setBulkAllowUnknownProbe(false);
    } finally {
      setBusy(false);
    }
  };

  const activate = async (id: string) => {
    setBusy(true);
    setError("");
    setStatusMessage("");
    try {
      const result = await setActiveConnection(id);
      setConnections(result.connections);
      setActiveConnectionId(result.activeId);
      const active = result.connections.find((connection) => connection.id === result.activeId);
      setActiveModel(active?.models[0] ?? "");
      setStatusMessage(active ? `${active.providerName} is now active.` : "No connection is active.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not activate this API connection.");
    } finally {
      setBusy(false);
    }
  };

  const deleteConnection = async (id: string) => {
    if (!window.confirm("Delete this saved API connection?")) return;
    setBusy(true);
    setError("");
    setStatusMessage("");
    try {
      const result = await removeConnection(id);
      setConnections(result.connections);
      setActiveConnectionId(result.activeId);
      const active = result.connections.find((connection) => connection.id === result.activeId);
      setActiveModel(active?.models[0] ?? "");
      setStatusMessage("API connection deleted.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not delete this API connection.");
    } finally {
      setBusy(false);
    }
  };

  const refresh = async (id: string) => {
    setBusy(true);
    setError("");
    setStatusMessage("");
    try {
      const result = await refreshConnection(id);
      setConnections(result.connections);
      setActiveConnectionId(result.activeId);
      const active = result.connections.find((connection) => connection.id === result.activeId);
      if (active && !active.models.includes(activeModel)) setActiveModel(active.models[0] ?? "");
      const refreshed = result.connections.find((connection) => connection.id === id);
      setStatusMessage(
        refreshed
          ? `Refreshed ${refreshed.models.length} chat model${refreshed.models.length === 1 ? "" : "s"} for ${refreshed.providerName}.`
          : "Connection models refreshed.",
      );
    } catch (reason) {
      if (reason instanceof ApiRequestError) {
        const status = reason.status === 401 || reason.status === 403
          ? "invalid"
          : reason.status === 429
            ? "rate-limited"
            : undefined;
        if (status) {
          setConnections(useAppStore.getState().connections.map((connection) =>
            connection.id === id ? { ...connection, status } : connection,
          ));
        }
      }
      setError(reason instanceof Error ? reason.message : "Could not refresh this API connection.");
    } finally {
      setBusy(false);
    }
  };

  const cancelReplacement = () => {
    setReplacingId(null);
    setDraft("");
    setAllowUnknownProbe(false);
    setError("");
  };

  const replacing = connections.find((connection) => connection.id === replacingId);
  const trimmedDraft = draft.trim();
  const hintedProvider = detectProvider(trimmedDraft);

  return (
    <div className="page-shell">
      <Header title="Connect AI" showBack />
      <main id="main-content" className="config-page">
        <h1>Connect an AI service</h1>
        <p className="page-description">Add your AI key to connect a service. Your key is checked and saved on this device.</p>

        <form className="config-input glass" onSubmit={(event) => void submitKey(event)}>
          <label className="sr-only" htmlFor="api-key">{replacing ? `Replacement key for ${replacing.providerName}` : "Your AI key"}</label>
          <input
            id="api-key"
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              setAllowUnknownProbe(false);
            }}
            placeholder={replacing ? `Replace ${replacing.providerName} key ...` : "Paste a supported AI chat key ..."}
            type="password"
            autoComplete="off"
            maxLength={4096}
            disabled={busy}
          />
          <button type="submit" className="primary-button" disabled={busy || loading || (!replacingId && connections.length >= 10)}>
            {busy ? "Checking..." : replacing ? "Check and replace" : "Check and save"}
          </button>
          {replacingId && (
            <button type="button" className="secondary-button" onClick={cancelReplacement} disabled={busy} aria-label="Cancel key replacement">
              <X size={16} />
            </button>
          )}
        </form>
        {hintedProvider && (
          <p className="page-description" aria-live="polite">
            Likely API type: {providerNames[hintedProvider]} chat service. The key will be verified before it is saved.
          </p>
        )}
        {!hintedProvider && trimmedDraft.length >= 8 && (
          <p className="page-description" aria-live="polite">
            This key format is not recognized. With your consent, CONDUIT can check it against supported AI chat services.
            Payment, cloud, database, and other non-chat API keys need dedicated integrations.
          </p>
        )}
        {!hintedProvider && trimmedDraft.length >= 8 && (
          <label className="consent-row">
            <input
              type="checkbox"
              checked={allowUnknownProbe}
              onChange={(event) => setAllowUnknownProbe(event.target.checked)}
              disabled={busy}
            />
            I consent to sending this key to supported AI providers to identify it.
          </label>
        )}
        <section className="key-card glass" aria-labelledby="csv-import-heading">
          <h2 id="csv-import-heading">Import API keys from CSV</h2>
          <p className="page-description">
            Export your Excel sheet as a CSV with one API key per row, or include an “API key” column. Keys are checked one at a time; no chat messages are sent.
          </p>
          <label>
            Choose a CSV file
            <input
              type="file"
              accept=".csv,text/csv"
              aria-label="Import API keys from CSV"
              onChange={(event) => void selectCsvFile(event)}
              disabled={busy || loading}
            />
          </label>
          {bulkFileName && (
            <form onSubmit={(event) => void importCsvKeys(event)}>
              <p>{bulkFileName}: {bulkKeys.length} unique key{bulkKeys.length === 1 ? "" : "s"} ready to check.</p>
              <label className="consent-row">
                <input
                  type="checkbox"
                  checked={bulkAllowUnknownProbe}
                  onChange={(event) => setBulkAllowUnknownProbe(event.target.checked)}
                  disabled={busy}
                />
                I consent to checking keys with unrecognized formats against supported AI providers. No chat messages will be sent.
              </label>
              <button type="submit" className="primary-button" disabled={busy || loading || connections.length >= 10}>
                <Upload size={16} /> {busy ? "Checking keys..." : "Check and add keys"}
              </button>
            </form>
          )}
        </section>
        <p className="counter">({connections.length}/10 saved)</p>
        {error && <p className="error-alert" role="alert">{error}</p>}
        {statusMessage && <p className="success-alert" role="status">{statusMessage}</p>}

        <div className="connection-list" aria-live="polite">
          {loading ? (
            <p className="empty-history">Loading saved connections...</p>
          ) : connections.length === 0 ? (
            <p className="empty-history">No API connections saved. Add a valid provider key to start chatting.</p>
          ) : (
            <section className="connection-environment" aria-label="Default environment">
              <h2>Default</h2>
              {connections.map((connection) => {
                const isActive = connection.id === activeConnectionId;
                return (
                  <GlassCard key={connection.id} className={`key-card ${isActive ? "on" : ""}`}>
                    <div className="connection-heading">
                      <div>
                        <h2>{connection.providerName}</h2>
                        <p className="key-masked">{connection.keyHint}</p>
                      </div>
                      {isActive && <span className="chip"><Check size={12} /> Active</span>}
                    </div>
                    <div className="key-status-row">
                      <span className={`status-dot ${connection.status === "invalid" || connection.status === "rate-limited" ? connection.status : "working"}`} />
                      <span>
                        {connection.status === "invalid"
                          ? "Invalid key"
                          : connection.status === "rate-limited"
                            ? "Rate limited"
                            : "Valid"}
                        {" · "}{connection.models.length} chat model{connection.models.length === 1 ? "" : "s"}
                        {" · Last validated "}
                        {new Date(connection.lastValidatedAt ?? connection.addedAt).toLocaleString()}
                      </span>
                    </div>
                    <label className="model-select-label">
                      Default model
                      <select
                        value={isActive ? activeModel || connection.models[0] : connection.models[0]}
                        onChange={(event) => {
                          if (isActive) setActiveModel(event.target.value);
                        }}
                        disabled={!isActive}
                      >
                        {connection.models.map((model) => <option key={model} value={model}>{model}</option>)}
                      </select>
                    </label>
                    <div className="key-actions">
                      {!isActive && <button type="button" className="secondary-button" onClick={() => void activate(connection.id)} disabled={busy}>Use this key</button>}
                      <button type="button" className="secondary-button" onClick={() => void refresh(connection.id)} disabled={busy}>
                        <RefreshCw size={14} /> Refresh validation
                      </button>
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => {
                          setReplacingId(connection.id);
                          setDraft("");
                          setError("");
                        }}
                        disabled={busy}
                      >
                        <RefreshCw size={14} /> Replace key
                      </button>
                      <button type="button" className="danger-button" onClick={() => void deleteConnection(connection.id)} disabled={busy}>
                        <Trash2 size={14} /> Delete
                      </button>
                    </div>
                  </GlassCard>
                );
              })}
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
