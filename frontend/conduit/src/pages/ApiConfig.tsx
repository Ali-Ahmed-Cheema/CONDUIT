import { useEffect, useState, type FormEvent } from "react";
import { Check, RefreshCw, Trash2, X } from "lucide-react";
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
import type { ConnectionsResponse, ProviderId } from "../types";
import { useAppStore } from "../store";

const detectProvider = (key: string): ProviderId | undefined => {
  if (key.startsWith("AIza")) return "google";
  if (key.startsWith("sk-ant-")) return "anthropic";
  if (key.startsWith("sk-or-")) return "openrouter";
  if (key.startsWith("hf_")) return "huggingface";
  if (key.startsWith("gsk_")) return "groq";
  if (key.startsWith("sk-")) return "openai";
  return undefined;
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
      setError("Enter an API key between 8 and 4096 characters.");
      return;
    }
    if (!hintedProvider && !allowUnknownProbe) {
      setError("This key's provider cannot be identified. Enable provider probing to check it against supported providers.");
      return;
    }

    setBusy(true);
    setError("");
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
      setDraft("");
      setAllowUnknownProbe(false);
      setReplacingId(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The API key could not be validated.");
    } finally {
      setBusy(false);
    }
  };

  const activate = async (id: string) => {
    setBusy(true);
    setError("");
    try {
      const result = await setActiveConnection(id);
      setConnections(result.connections);
      setActiveConnectionId(result.activeId);
      const active = result.connections.find((connection) => connection.id === result.activeId);
      setActiveModel(active?.models[0] ?? "");
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
    try {
      const result = await removeConnection(id);
      setConnections(result.connections);
      setActiveConnectionId(result.activeId);
      const active = result.connections.find((connection) => connection.id === result.activeId);
      setActiveModel(active?.models[0] ?? "");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not delete this API connection.");
    } finally {
      setBusy(false);
    }
  };

  const refresh = async (id: string) => {
    setBusy(true);
    setError("");
    try {
      const result = await refreshConnection(id);
      setConnections(result.connections);
      setActiveConnectionId(result.activeId);
      const active = result.connections.find((connection) => connection.id === result.activeId);
      if (active && !active.models.includes(activeModel)) setActiveModel(active.models[0] ?? "");
    } catch (reason) {
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

  return (
    <div className="page-shell">
      <Header title="API Config" showBack />
      <main className="config-page">
        <h1>API connections</h1>
        <p className="page-description">Keys are validated with their provider and stored encrypted by the local API service.</p>

        <form className="config-input glass" onSubmit={(event) => void submitKey(event)}>
          <label className="sr-only" htmlFor="api-key">{replacing ? `Replacement key for ${replacing.providerName}` : "API key"}</label>
          <input
            id="api-key"
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              setAllowUnknownProbe(false);
            }}
            placeholder={replacing ? `Replace ${replacing.providerName} key ...` : "Paste API key ..."}
            type="password"
            autoComplete="off"
            maxLength={4096}
            disabled={busy}
          />
          <button type="submit" className="primary-button" disabled={busy || loading || (!replacingId && connections.length >= 10)}>
            {busy ? "Checking..." : replacing ? "Validate & replace" : "Validate & add"}
          </button>
          {replacingId && (
            <button type="button" className="secondary-button" onClick={cancelReplacement} disabled={busy} aria-label="Cancel key replacement">
              <X size={16} />
            </button>
          )}
        </form>
        {detectProvider(draft.trim()) === undefined && draft.trim().length >= 8 && (
          <label className="consent-row">
            <input
              type="checkbox"
              checked={allowUnknownProbe}
              onChange={(event) => setAllowUnknownProbe(event.target.checked)}
              disabled={busy}
            />
            I consent to checking this key against supported providers.
          </label>
        )}
        <p className="counter">({connections.length}/10 saved)</p>
        {error && <p className="error-alert" role="alert">{error}</p>}

        <div className="connection-list" aria-live="polite">
          {loading ? (
            <p className="empty-history">Loading saved connections...</p>
          ) : connections.length === 0 ? (
            <p className="empty-history">No API connections saved. Add a valid provider key to start chatting.</p>
          ) : connections.map((connection) => {
            const isActive = connection.id === activeConnectionId;
            return (
              <article key={connection.id} className={`key-card glass ${isActive ? "on" : ""}`}>
                <div className="connection-heading">
                  <div>
                    <h2>{connection.providerName}</h2>
                    <p className="key-masked">{connection.keyHint}</p>
                  </div>
                  {isActive && <span className="chip"><Check size={12} /> Active</span>}
                </div>
                <div className="key-status-row">
                  <span className="status-dot working" />
                  <span>Validated · {connection.models.length} chat model{connection.models.length === 1 ? "" : "s"}</span>
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
              </article>
            );
          })}
        </div>
      </main>
    </div>
  );
}
