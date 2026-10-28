import { useMemo, useState, type FormEvent } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  Activity,
  ArrowDownRight,
  Check,
  ChevronRight,
  CircleHelp,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  LockKeyhole,
  Plus,
  Search,
  Shield,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import {
  credentialCategories,
  credentialRestrictions,
  credentialTypes,
  type CredentialField,
  type CredentialType,
} from "./credentials";
import "./style.css";

type SavedCredential = {
  id: string;
  name: string;
  typeId: string;
  values: Record<string, string>;
  restrictions: Record<string, string>;
};

const initialType = credentialTypes[0];

function App() {
  const [selectedId, setSelectedId] = useState(initialType.id);
  const [category, setCategory] = useState("All credentials");
  const [query, setQuery] = useState("");
  const [name, setName] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [activeRestrictions, setActiveRestrictions] = useState<string[]>([]);
  const [restrictionValues, setRestrictionValues] = useState<Record<string, string>>({});
  const [credentials, setCredentials] = useState<SavedCredential[]>([]);
  const [error, setError] = useState("");
  const [showOverview, setShowOverview] = useState(false);

  const selected = credentialTypes.find((item) => item.id === selectedId) ?? initialType;
  const visibleTypes = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return credentialTypes.filter((item) => {
      const matchesCategory = category === "All credentials" || item.category === category;
      const matchesQuery =
        !normalizedQuery ||
        `${item.name} ${item.description} ${item.example} ${item.category}`.toLowerCase().includes(normalizedQuery);
      return matchesCategory && matchesQuery;
    });
  }, [category, query]);

  function chooseType(item: CredentialType) {
    setSelectedId(item.id);
    setName("");
    setValues({});
    setActiveRestrictions([]);
    setRestrictionValues({});
    setError("");
  }

  function updateValue(id: string, value: string) {
    setValues((current) => ({ ...current, [id]: value }));
  }

  function toggleRestriction(id: string) {
    setActiveRestrictions((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  }

  function submitCredential(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const missingField = selected.fields.find(
      (field) => field.required !== false && !values[field.id]?.trim(),
    );
    if (missingField) {
      setError(`${missingField.label} is required.`);
      return;
    }

    if (selected.id === "service-account") {
      try {
        JSON.parse(values.serviceAccountJson);
      } catch {
        setError("Enter valid JSON for the service account key.");
        return;
      }
    }

    setCredentials((current) => [
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name: name.trim() || selected.name,
        typeId: selected.id,
        values,
        restrictions: Object.fromEntries(
          activeRestrictions.map((id) => [id, restrictionValues[id] ?? ""]),
        ),
      },
      ...current,
    ]);
    setName("");
    setValues({});
    setActiveRestrictions([]);
    setRestrictionValues({});
    setError("");
  }

  function removeCredential(id: string) {
    setCredentials((current) => current.filter((item) => item.id !== id));
  }

  const selectedTypeName = (id: string) =>
    credentialTypes.find((item) => item.id === id)?.name ?? "Credential";

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#" aria-label="CONDUIT home">
          <span className="brand-mark"><span /></span>
          <span>CONDUIT</span>
          <span className="brand-version">WORKSPACE</span>
        </a>
        <div className="topbar-right">
          <span className="local-indicator"><span /> LOCAL SESSION</span>
          <button className="icon-button help-button" aria-label="Toggle quick reference" onClick={() => setShowOverview((value) => !value)}>
            <CircleHelp size={17} />
          </button>
        </div>
      </header>

      <main className="workspace">
        <section className="page-heading">
          <div className="eyebrow"><span className="eyebrow-line" /> CREDENTIAL WORKSPACE <span className="eyebrow-line" /></div>
          <h1>Every key. <span>Under control.</span></h1>
          <p>Understand credentials, record what you use, and keep sensitive values in a local session.</p>
        </section>

        <section className="security-banner" aria-label="Privacy notice">
          <div className="security-icon"><LockKeyhole size={17} /></div>
          <div>
            <strong>Private by design</strong>
            <p>Values stay in this browser tab's memory. Nothing is sent to a server or saved to storage.</p>
          </div>
          <span className="memory-badge"><span /> MEMORY ONLY</span>
        </section>

        {showOverview && (
          <section className="overview-panel">
            <div className="overview-title"><ShieldCheck size={18} /><div><strong>Credential response guide</strong><span>What to expect when a provider receives a credential</span></div></div>
            <div className="response-grid">
              <span><b className="status-ok">200</b> Valid credential; request succeeded</span>
              <span><b className="status-denied">401</b> Missing, invalid, or expired</span>
              <span><b className="status-denied">403</b> Valid, but permission is missing</span>
              <span><b className="status-wait">429</b> Rate limit or quota reached</span>
            </div>
            <p className="overview-note"><b>Common transports:</b> <code>Authorization: Bearer …</code> or an <code>x-api-key</code> header. Request-body credentials are uncommon.</p>
            <p className="overview-note"><b>Safer transport:</b> avoid query-string secrets; URLs can be recorded in logs.</p>
            <p className="overview-note"><b>Best practice:</b> keep secrets in server-side environment variables, rotate them regularly, and revoke exposed credentials.</p>
          </section>
        )}

        <div className="workspace-grid">
          <aside className="catalog-panel">
            <div className="panel-heading">
              <div><span className="section-kicker">01 / THE CATALOG</span><h2>Credential types</h2></div>
              <span className="count-pill">{credentialTypes.length.toString().padStart(2, "0")}</span>
            </div>
            <label className="search-box">
              <Search size={16} />
              <input aria-label="Search credential types" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search credentials…" />
              {query && <button type="button" className="search-clear" onClick={() => setQuery("")} aria-label="Clear search"><X size={14} /></button>}
            </label>
            <div className="category-list" aria-label="Credential categories">
              {["All credentials", ...credentialCategories].map((item) => (
                <button key={item} className={`category-button${category === item ? " active" : ""}`} onClick={() => setCategory(item)}>
                  <span>{item}</span>
                  {category === item && <ChevronRight size={14} />}
                </button>
              ))}
            </div>
            <div className="list-label">{category === "All credentials" ? "ALL TYPES" : category.toUpperCase()}</div>
            <div className="credential-list">
              {visibleTypes.map((item, index) => (
                <button key={item.id} className={`credential-option${selectedId === item.id ? " selected" : ""}`} onClick={() => chooseType(item)}>
                  <span className={`type-index${selectedId === item.id ? " active" : ""}`}>{String(index + 1).padStart(2, "0")}</span>
                  <span className="type-option-copy"><strong>{item.name}</strong><small>{item.category}</small></span>
                  {selectedId === item.id && <span className="selected-dot" />}
                </button>
              ))}
              {visibleTypes.length === 0 && <div className="empty-search">No credentials match “{query}”.</div>}
            </div>
            <div className="catalog-foot"><Shield size={14} /><span>Credentials are reference entries, not verified against a provider.</span></div>
          </aside>

          <section className="detail-column">
            <article className="form-panel">
              <div className="form-panel-top">
                <span className="section-kicker">02 / CONFIGURE CREDENTIAL</span>
                <span className="category-tag">{selected.category}</span>
              </div>
              <div className="credential-intro">
                <div className="credential-symbol"><KeyRound size={20} /></div>
                <div><h2>{selected.name}</h2><p>{selected.description}</p></div>
              </div>

              <div className="credential-context">
                <div><span className="micro-label">EXAMPLE</span><p>{selected.example}</p></div>
                <div><span className="micro-label">TYPICAL RESPONSE</span><p>{selected.output}</p></div>
              </div>

              {selected.warning && <div className="warning-note"><Shield size={15} /><span>{selected.warning}</span></div>}

              <form onSubmit={submitCredential} noValidate>
                <div className="field-label-row"><label htmlFor="credential-name">Display name</label><span>OPTIONAL</span></div>
                <input id="credential-name" className="text-input" value={name} onChange={(event) => setName(event.target.value)} placeholder={`e.g. ${selected.name} — staging`} autoComplete="off" />

                <div className="form-divider"><span>CREDENTIAL DETAILS</span></div>
                <div className="credential-fields">
                  {selected.fields.map((field) => (
                    <CredentialInput key={field.id} field={field} value={values[field.id] ?? ""} onChange={(value) => updateValue(field.id, value)} />
                  ))}
                </div>

                <details className="restrictions">
                  <summary><span><ShieldCheck size={16} /> Add restrictions</span><span className="optional-label">OPTIONAL <ChevronRight size={13} /></span></summary>
                  <p className="restriction-caption">Restrictions are configured with your provider, not applied by this local reference.</p>
                  <div className="restriction-list">
                    {credentialRestrictions.map((restriction) => (
                      <div className="restriction-item" key={restriction.id}>
                        <label className="restriction-toggle">
                          <input type="checkbox" checked={activeRestrictions.includes(restriction.id)} onChange={() => toggleRestriction(restriction.id)} />
                          <span className="custom-check"><Check size={12} /></span>
                          <span><strong>{restriction.label}</strong><small>{restriction.description}</small></span>
                        </label>
                        {activeRestrictions.includes(restriction.id) && (
                          <input
                            className="text-input restriction-input"
                            aria-label={restriction.field.label}
                            value={restrictionValues[restriction.id] ?? ""}
                            onChange={(event) => setRestrictionValues((current) => ({ ...current, [restriction.id]: event.target.value }))}
                            placeholder={restriction.field.placeholder}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </details>

                {error && <p className="form-error" role="alert">{error}</p>}
                <button className="add-button" type="submit"><Plus size={16} /> Add to this session <ArrowDownRight size={15} /></button>
                <p className="form-footnote"><LockKeyhole size={12} /> Values stay in memory until this tab closes. Copying a value also places it on your system clipboard.</p>
              </form>
            </article>
          </section>

          <aside className="session-panel">
            <div className="session-heading">
              <div><span className="section-kicker">03 / YOUR SESSION</span><h2>In this workspace</h2></div>
              <span className="session-count">{credentials.length.toString().padStart(2, "0")}</span>
            </div>
            {credentials.length === 0 ? (
              <div className="empty-session">
                <div className="empty-icon"><KeyRound size={19} /></div>
                <strong>Your session is clear</strong>
                <p>Choose a credential type, fill in its fields, then add it here.</p>
                <div className="empty-rule" />
                <span><LockKeyhole size={12} /> Nothing is stored on disk</span>
              </div>
            ) : (
              <div className="session-entries">
                {credentials.map((credential) => (
                  <SessionCredential key={credential.id} credential={credential} typeName={selectedTypeName(credential.typeId)} onRemove={() => removeCredential(credential.id)} />
                ))}
                <button className="clear-session" onClick={() => setCredentials([])}><Trash2 size={13} /> Clear session</button>
              </div>
            )}
            <div className="session-footer"><Activity size={14} /><span>SESSION STATUS</span><b><span /> ACTIVE</b></div>
          </aside>
        </div>
        <footer className="page-footer"><span>CONDUIT <i>•</i> CREDENTIAL REFERENCE</span><span>Credentials vary by provider. Always follow the provider's security guidance.</span></footer>
      </main>
    </div>
  );
}

function CredentialInput({ field, value, onChange }: { field: CredentialField; value: string; onChange: (value: string) => void }) {
  const [visible, setVisible] = useState(false);
  const isSecret = field.type === "secret" || field.id === "serviceAccountJson";

  return (
    <div className="field-group">
      <div className="field-label-row">
        <label htmlFor={`field-${field.id}`}>{field.label}</label>
        <span>{field.required === false ? "OPTIONAL" : "REQUIRED"}</span>
      </div>
      <div className={`input-wrap${field.type === "textarea" ? " textarea-wrap" : ""}`}>
        {field.type === "textarea" ? (
          <textarea id={`field-${field.id}`} className={isSecret && !visible ? "concealed" : ""} value={value} onChange={(event) => onChange(event.target.value)} placeholder={field.placeholder} rows={field.id === "serviceAccountJson" ? 5 : 3} spellCheck={false} autoComplete="off" />
        ) : (
          <input
            id={`field-${field.id}`}
            type={field.type === "secret" ? (visible ? "text" : "password") : field.type}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder={field.placeholder}
            autoComplete="off"
            spellCheck={false}
          />
        )}
        {isSecret && (
          <button type="button" className={`reveal-button${field.type === "textarea" ? " textarea-reveal" : ""}`} onClick={() => setVisible((current) => !current)} aria-label={visible ? `Hide ${field.label}` : `Show ${field.label}`}>
            {visible ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        )}
      </div>
      {field.helper && <p className="field-helper">{field.helper}</p>}
    </div>
  );
}

function SessionCredential({ credential, typeName, onRemove }: { credential: SavedCredential; typeName: string; onRemove: () => void }) {
  const [copied, setCopied] = useState(false);
  const values = Object.values(credential.values).filter(Boolean);
  const type = credentialTypes.find((item) => item.id === credential.typeId);
  const details = Object.entries(credential.values).flatMap(([id, value]) => {
    const field = type?.fields.find((item) => item.id === id);
    return value && field && field.type !== "secret" && field.id !== "serviceAccountJson"
      ? [{ label: field.label, value }]
      : [];
  });
  const restrictions = Object.entries(credential.restrictions).flatMap(([id, value]) => {
    const restriction = credentialRestrictions.find((item) => item.id === id);
    return restriction ? [`${restriction.label}${value ? `: ${value}` : ""}`] : [];
  });

  async function copyCredential() {
    try {
      await navigator.clipboard.writeText(values.join("\n"));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch (error) {
      console.error("Could not copy credential to clipboard.", error);
    }
  }

  return (
    <article className="session-entry">
      <div className="entry-top">
        <div className="entry-key-icon"><KeyRound size={15} /></div>
        <button className="remove-button" onClick={onRemove} aria-label={`Remove ${credential.name}`}><X size={15} /></button>
      </div>
      <strong className="entry-name">{credential.name}</strong>
      <span className="entry-type">{typeName}</span>
      {details.length > 0 && (
        <dl className="entry-details">
          {details.map((detail) => (
            <div key={detail.label}><dt>{detail.label}</dt><dd title={detail.value}>{detail.value}</dd></div>
          ))}
        </dl>
      )}
      {restrictions.length > 0 && <p className="entry-restrictions">{restrictions.join(" · ")}</p>}
      <div className="masked-value"><span>••••••••••••••••</span><span>IN MEMORY</span></div>
      <div className="entry-actions">
        <button onClick={copyCredential}><Copy size={12} /> {copied ? "Copied" : "Copy value"}</button>
        <button onClick={onRemove}><Trash2 size={12} /> Remove</button>
      </div>
    </article>
  );
}

declare global {
  interface Window {
    __conduitRoot?: Root;
  }
}

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("CONDUIT root element was not found.");
}

const root = window.__conduitRoot ?? createRoot(rootElement);
window.__conduitRoot = root;
root.render(<App />);
