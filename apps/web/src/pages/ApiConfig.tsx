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
import { GlassCard } from "@conduit/ui";
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
  const [environment, setEnvironment] = useState("Default");
  const [allowUnknownProbe, setAllowUnknownProbe] = useState(false);
  const [replacingId, setReplacingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");

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
    if (!environment.trim() || environment.trim().length > 40) {
      setError("Enter an environment name between 1 and 40 characters.");
      return;
    }
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
        const validation = await validateKey(trimmed, !hintedProvider && allowUnknownProbe, environment.trim());
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
    setEnvironment("Default");
    setAllowUnknownProbe(false);
    setError("");
  };

  const replacing = connections.find((connection) => connection.id === replacingId);
  const trimmedDraft = draft.trim();
  const hintedProvider = detectProvider(trimmedDraft);
  const groupedConnections = connections.reduce((groups, connection) => {
    const name = connection.environment?.trim() || "Default";
    const group = groups.get(name) ?? [];
    group.push(connection);
    groups.set(name, group);
    return groups;
  }, new Map<string, typeof connections>());

  return (
    <div className="page-shell">
      <Header title="Connect AI" showBack />
      <main id="main-content" className="config-page">
        <h1>Connect an AI service</h1>
        <p className="page-description">Add your AI key to connect a service. Your key is checked and saved on this device.</p>

        <label className="model-select-label">
          Environment
          <input
            aria-label="Environment"
            value={environment}
            onChange={(event) => setEnvironment(event.target.value)}
            placeholder="e.g. Development, Staging, Production"
            maxLength={40}
            disabled={busy}
          />
        </label>
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
        <p className="counter">({connections.length}/10 saved)</p>
        {error && <p className="error-alert" role="alert">{error}</p>}
        {statusMessage && <p className="success-alert" role="status">{statusMessage}</p>}

        <div className="connection-list" aria-live="polite">
          {loading ? (
            <p className="empty-history">Loading saved connections...</p>
          ) : connections.length === 0 ? (
            <p className="empty-history">No API connections saved. Add a valid provider key to start chatting.</p>
          ) : [...groupedConnections.entries()].map(([environmentName, environmentConnections]) => (
            <section className="connection-environment" key={environmentName} aria-label={`${environmentName} environment`}>
              <h2>{environmentName}</h2>
              {environmentConnections.map((connection) => {
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
                          setEnvironment(connection.environment ?? "Default");
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
          ))}
        </div>
      </main>
    </div>
  );
}
