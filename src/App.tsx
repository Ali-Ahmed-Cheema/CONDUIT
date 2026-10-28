import { useMemo, useState, type FormEvent } from "react";
import {
  AlertTriangle,
  Check,
  CircleHelp,
  Eye,
  EyeOff,
  Fingerprint,
  Globe2,
  KeyRound,
  LockKeyhole,
  Plus,
  Search,
  Server,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { types, type CredentialType, type Group } from "./credentialTypes";

const groups = [
  "All types",
  "Visibility",
  "Permission",
  "Environment",
  "Token",
  "Machine",
] as const;
type GroupFilter = (typeof groups)[number];
const descriptions: Record<Group, string> = {
  Visibility: "Choose based on where the credential is allowed to be used.",
  Permission:
    "Prefer the narrowest permissions that meet the integration's needs.",
  Environment: "Keep test credentials separate from production credentials.",
  Token: "Token-based credentials often expire or have user-specific scopes.",
  Machine: "Used by services, signed requests, and webhook integrations.",
};
type SavedCredential = {
  id: string;
  typeId: string;
  name: string;
  provider: string;
  values: Record<string, string>;
  restrictions: Record<string, string>;
};

function App() {
  const [filter, setFilter] = useState<GroupFilter>("All types");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<CredentialType | null>(null);
  const [saved, setSaved] = useState<SavedCredential[]>([]);
  const [toast, setToast] = useState("");
  const visible = useMemo(
    () =>
      types.filter(
        (item) =>
          (filter === "All types" || item.group === filter) &&
          `${item.name} ${item.purpose} ${item.example} ${item.group}`
            .toLowerCase()
            .includes(query.trim().toLowerCase()),
      ),
    [filter, query],
  );
  const sections = useMemo(
    () =>
      groups
        .filter((group): group is Group => group !== "All types")
        .map((group) => ({
          group,
          items: visible.filter((item) => item.group === group),
        }))
        .filter((section) => section.items.length > 0),
    [visible],
  );

  function addCredential(credential: SavedCredential) {
    setSaved((current) => [credential, ...current]);
    setSelected(null);
    setToast("Credential added to this session");
    window.setTimeout(() => setToast(""), 3000);
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <a className="brand" href="#" aria-label="CONDUIT home">
          <span className="brand-icon">
            <i />
          </span>
          <span>
            CONDUIT<small>V3</small>
          </span>
        </a>
        <div className="side-label">WORKSPACE</div>
        <div className="active-nav">
          <KeyRound size={17} /> Credentials <span>{saved.length}</span>
        </div>
        <div className="side-label category-label">CREDENTIAL TYPES</div>
        <nav aria-label="Credential categories">
          {groups.map((group) => (
            <button
              className={`side-nav ${filter === group ? "selected" : ""}`}
              key={group}
              onClick={() => setFilter(group)}
              type="button"
            >
              <i />
              {group}
              <span>
                {group === "All types"
                  ? types.length
                  : types.filter((item) => item.group === group).length}
              </span>
            </button>
          ))}
        </nav>
        <div className="sidebar-spacer" />
        <div className="sidebar-note">
          <LockKeyhole size={17} />
          <div>
            <strong>Session-only workspace</strong>
            <p>
              Entries stay in page memory and clear when you reload or close
              this tab.
            </p>
          </div>
        </div>
        <div className="sidebar-foot">CONDUIT · LOCAL WORKSPACE</div>
      </aside>

      <main>
        <header className="topbar">
          <div>
            Workspace <span>/</span> <b>Credentials</b>
          </div>
          <div className="local">
            <i /> Local session
          </div>
        </header>
        <div className="content">
          <section className="page-title">
            <div>
              <div className="eyebrow">
                <Fingerprint size={14} /> CREDENTIAL WORKSPACE
              </div>
              <h1>API credentials</h1>
              <p>
                Explore common credential types and enter sample values in a
                private session.
              </p>
            </div>
            <button
              className="primary"
              onClick={() => setSelected(types[0])}
              type="button"
            >
              <Plus size={16} /> Add credential
            </button>
          </section>

          <section className="privacy-banner">
            <div className="privacy-icon">
              <ShieldCheck size={18} />
            </div>
            <div>
              <strong>Private by design</strong>
              <p>
                Values stay in this browser tab's memory. CONDUIT does not store
                or transmit them, or call third-party APIs.
              </p>
            </div>
            <span>NO NETWORK CALLS</span>
          </section>

          <section className="stats">
            <div>
              <span className="stat-icon purple">
                <KeyRound size={17} />
              </span>
              <label>
                Credential types<strong>{types.length}</strong>
              </label>
              <small>Across 5 categories</small>
            </div>
            <div>
              <span className="stat-icon green">
                <ShieldCheck size={17} />
              </span>
              <label>
                In this session<strong>{saved.length}</strong>
              </label>
              <small>Clears on page reload</small>
            </div>
            <div>
              <span className="stat-icon blue">
                <Globe2 size={17} />
              </span>
              <label>
                External requests<strong>None</strong>
              </label>
              <small>No credentials leave this tab</small>
            </div>
          </section>

          {saved.length > 0 && (
            <section className="saved-section">
              <div className="section-heading">
                <div>
                  <div className="kicker">ACTIVE SESSION</div>
                  <h2>
                    Your credentials <em>{saved.length}</em>
                  </h2>
                </div>
                <span className="memory">
                  <i /> In memory only
                </span>
              </div>
              <div className="saved-list">
                {saved.map((item) => (
                  <div className="saved-row" key={item.id}>
                    <span className="saved-icon">
                      <KeyRound size={16} />
                    </span>
                    <div className="saved-name">
                      <strong>{item.name}</strong>
                      <small>
                        {item.provider || "No provider"} ·{" "}
                        {types.find((type) => type.id === item.typeId)?.name}
                      </small>
                    </div>
                    <span className="added">
                      <Check size={12} /> Added
                    </span>
                    <button
                      aria-label={`Remove ${item.name}`}
                      title="Remove and clear values"
                      onClick={() =>
                        setSaved((current) =>
                          current.filter((entry) => entry.id !== item.id),
                        )
                      }
                      type="button"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="type-section">
            <div className="section-heading types-heading">
              <div>
                <div className="kicker">REFERENCE & INPUTS</div>
                <h2>{filter === "All types" ? "Credential types" : filter}</h2>
                <p>
                  {filter === "All types"
                    ? "Select a type to see its purpose, common behavior, and fields."
                    : descriptions[filter]}
                </p>
              </div>
              <label className="search">
                <Search size={15} />
                <input
                  aria-label="Search credential types"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search types…"
                />
                {query && (
                  <button
                    aria-label="Clear search"
                    onClick={() => setQuery("")}
                    type="button"
                  >
                    <X size={14} />
                  </button>
                )}
              </label>
            </div>
            {sections.length === 0 ? (
              <div className="empty">
                <Search size={20} />
                <strong>No credential types found</strong>
                <span>Try a different search or category.</span>
              </div>
            ) : (
              <div className="sections">
                {sections.map(({ group, items }) => (
                  <div key={group}>
                    {filter === "All types" && (
                      <div className="group-heading">
                        <i className={`dot ${group.toLowerCase()}`} />
                        <h3>{group}</h3>
                        <span>
                          {items.length} {items.length === 1 ? "type" : "types"}
                        </span>
                      </div>
                    )}
                    <div className="cards">
                      {items.map((item) => (
                        <article className="card" key={item.id}>
                          <div className="card-top">
                            <span
                              className={`type-icon ${item.group.toLowerCase()}`}
                            >
                              {item.group === "Visibility" ? (
                                <Eye size={16} />
                              ) : item.group === "Permission" ? (
                                <ShieldCheck size={16} />
                              ) : item.group === "Environment" ? (
                                <Globe2 size={16} />
                              ) : item.group === "Token" ? (
                                <Fingerprint size={16} />
                              ) : (
                                <Server size={16} />
                              )}
                            </span>
                            <small>{item.group}</small>
                            <button
                              aria-label={`Add ${item.name}`}
                              title={`Add ${item.name}`}
                              onClick={() => setSelected(item)}
                              type="button"
                            >
                              <Plus size={16} />
                            </button>
                          </div>
                          <h4>{item.name}</h4>
                          <p className="purpose">{item.purpose}</p>
                          <div className="example">{item.example}</div>
                          <div className="result">
                            <b>ON USE</b>
                            {item.result}
                          </div>
                          <button
                            className="enter"
                            onClick={() => setSelected(item)}
                            type="button"
                          >
                            Enter credentials <span>›</span>
                          </button>
                        </article>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="protections">
            <span className="protection-icon">
              <LockKeyhole size={18} />
            </span>
            <div>
              <div className="kicker">OPTIONAL PROTECTIONS</div>
              <h2>Restrictions you can apply</h2>
              <p>
                Where supported, configure these with your provider. This
                workspace only records notes; it cannot enforce restrictions.
              </p>
            </div>
            <div className="tags">
              <span>
                <Globe2 size={13} /> IP addresses
              </span>
              <span>
                <Globe2 size={13} /> HTTP referrers / domains
              </span>
              <span>
                <Fingerprint size={13} /> App identifiers
              </span>
              <span>
                <ShieldCheck size={13} /> Rate limits & quotas
              </span>
            </div>
          </section>

          <section className="responses">
            <div className="response-title">
              <CircleHelp size={16} />
              <b>Common API responses</b>
            </div>
            <div className="response-items">
              <span>
                <b className="c200">200</b> Request succeeded
              </span>
              <span>
                <b className="c401">401</b> Missing, invalid, or expired
              </span>
              <span>
                <b className="c403">403</b> Not permitted
              </span>
              <span>
                <b className="c429">429</b> Rate limit or quota reached
              </span>
            </div>
          </section>
          <footer>
            <span>
              <LockKeyhole size={13} /> Never paste production secrets into a
              demo or untrusted app.
            </span>
            <span>CONDUIT V3 · CREDENTIAL REFERENCE</span>
          </footer>
        </div>
      </main>
      {selected && (
        <CredentialDialog
          type={selected}
          onClose={() => setSelected(null)}
          onSave={addCredential}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={15} />
          {toast}
        </div>
      )}
    </div>
  );
}

function CredentialDialog({
  type,
  onClose,
  onSave,
}: {
  type: CredentialType;
  onClose: () => void;
  onSave: (item: SavedCredential) => void;
}) {
  const [name, setName] = useState("");
  const [provider, setProvider] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [restrictions, setRestrictions] = useState<Record<string, string>>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [formError, setFormError] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (type.id === "service") {
      try {
        JSON.parse(values.json ?? "");
      } catch {
        setFormError("Enter valid JSON for the service account key.");
        return;
      }
    }

    onSave({
      id: crypto.randomUUID(),
      typeId: type.id,
      name: name.trim(),
      provider: provider.trim(),
      values,
      restrictions,
    });
  }

  return (
    <div
      className="backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
      >
        <header className="dialog-head">
          <span className="dialog-mark">
            <KeyRound size={18} />
          </span>
          <div>
            <div className="kicker">
              ADD CREDENTIAL · {type.group.toUpperCase()}
            </div>
            <h2 id="dialog-title">{type.name}</h2>
          </div>
          <button
            className="close"
            aria-label="Close dialog"
            onClick={onClose}
            type="button"
          >
            <X size={19} />
          </button>
        </header>
        <div className="dialog-context">
          <p>{type.purpose}</p>
          <span>
            <CircleHelp size={14} /> {type.result}
          </span>
        </div>
        <form onSubmit={submit}>
          <div className="form-grid">
            <label>
              Display name <b>*</b>
              <input
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Website billing"
                autoComplete="off"
              />
            </label>
            <label>
              Provider or service <small>OPTIONAL</small>
              <input
                value={provider}
                onChange={(event) => setProvider(event.target.value)}
                placeholder="e.g. Stripe, AWS, GitHub"
                autoComplete="off"
              />
            </label>
          </div>
          <div className="credential-fields">
            {type.fields.map((field) => (
              <label key={field.id}>
                {field.label}
                {!field.optional && <b> *</b>}
                <div className="input-wrap">
                  {field.multiline ? (
                    <textarea
                      className={
                        field.secret && !revealed[field.id]
                          ? "secret-textarea"
                          : undefined
                      }
                      required={!field.optional}
                      value={values[field.id] ?? ""}
                      onChange={(event) =>
                        setValues((current) => ({
                          ...current,
                          [field.id]: event.target.value,
                        }))
                      }
                      placeholder={field.placeholder}
                      rows={5}
                    />
                  ) : (
                    <input
                      required={!field.optional}
                      type={
                        field.id === "expiry"
                          ? "datetime-local"
                          : field.secret && !revealed[field.id]
                            ? "password"
                            : "text"
                      }
                      value={values[field.id] ?? ""}
                      onChange={(event) =>
                        setValues((current) => ({
                          ...current,
                          [field.id]: event.target.value,
                        }))
                      }
                      placeholder={field.placeholder}
                      autoComplete="off"
                    />
                  )}
                  {field.secret && (
                    <button
                      className="reveal"
                      type="button"
                      aria-label={`${revealed[field.id] ? "Hide" : "Show"} ${field.label}`}
                      onClick={() =>
                        setRevealed((current) => ({
                          ...current,
                          [field.id]: !current[field.id],
                        }))
                      }
                    >
                      {revealed[field.id] ? (
                        <EyeOff size={16} />
                      ) : (
                        <Eye size={16} />
                      )}
                    </button>
                  )}
                </div>
                {field.multiline && (
                  <small className="field-note">
                    Treat the entire service account file as a secret.
                  </small>
                )}
              </label>
            ))}
          </div>
          {formError && (
            <p className="form-error" role="alert">
              {formError}
            </p>
          )}
          <div className="form-separator" />
          <div className="restriction-heading">
            <div>
              <LockKeyhole size={14} />
              <b>Restrictions & limits</b>
              <small>OPTIONAL · PROVIDER-DEPENDENT</small>
            </div>
            <p>
              Only enter restrictions already configured with your provider.
              This form does not enforce them.
            </p>
          </div>
          <div className="form-grid">
            <label>
              Allowed IP addresses
              <input
                value={restrictions.ip ?? ""}
                onChange={(event) =>
                  setRestrictions((current) => ({
                    ...current,
                    ip: event.target.value,
                  }))
                }
                placeholder="203.0.113.10, 198.51.100.0/24"
              />
            </label>
            <label>
              Allowed domains / referrers
              <input
                value={restrictions.domain ?? ""}
                onChange={(event) =>
                  setRestrictions((current) => ({
                    ...current,
                    domain: event.target.value,
                  }))
                }
                placeholder="example.com, app.example.com"
              />
            </label>
            <label>
              App identifier
              <input
                value={restrictions.app ?? ""}
                onChange={(event) =>
                  setRestrictions((current) => ({
                    ...current,
                    app: event.target.value,
                  }))
                }
                placeholder="Android package or iOS bundle ID"
              />
            </label>
            <label>
              Rate limit / quota note
              <input
                value={restrictions.quota ?? ""}
                onChange={(event) =>
                  setRestrictions((current) => ({
                    ...current,
                    quota: event.target.value,
                  }))
                }
                placeholder="e.g. 1,000 requests / day"
              />
            </label>
          </div>
          <div className="warning">
            <AlertTriangle size={15} />
            <span>
              This is a local reference workspace, not a credential vault.
              Values are not encrypted or persisted; they clear when you close
              or reload the page.
            </span>
          </div>
          <div className="dialog-actions">
            <button className="cancel" onClick={onClose} type="button">
              Cancel
            </button>
            <button className="primary" type="submit">
              <Plus size={15} /> Add to this session
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export default App;
