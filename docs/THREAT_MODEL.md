# CONDUIT Threat Model

**Status:** V4 planning baseline
**Scope:** Current V3 implementation and security properties required by the
V4 north star. This is a design document, not a security certification.

## Security goals

1. Keep user-owned chats, preferences, files, prompts, memories, and provider
   credentials local by default.
2. Prevent accidental disclosure of saved provider credentials in API
   responses, errors, prompts, logs, backups, or telemetry.
3. Make every external transfer attributable to an explicit user-enabled
   provider, search, sync, plugin, or update action.
4. Preserve data through upgrades, password changes, imports, and storage
   migrations.
5. Degrade gracefully when offline, GPU-less, without a provider key, or when
   an optional feature is disabled.
6. Make trust boundaries, permissions, and residual risks understandable to
   users.

## Assets

| Asset | Confidentiality / integrity concern |
|---|---|
| Conversation messages, titles, system prompts, branches, summaries | Private content; integrity affects answers and audit trail |
| Provider API keys and provider account metadata | Secret bearer credentials; misuse can incur charges or expose provider data |
| Vault password, verifier, derived/wrapped keys, recovery material | Unlock/encryption boundary; loss can make data unrecoverable |
| Imported documents, attachments, embeddings, memories | User/private data; parser and retrieval inputs can be malicious |
| Plugin manifests, code, permissions, tool configuration | Code execution and access to user data/network |
| Sync ciphertext, device keys, pairing secrets | Confidentiality, integrity, replay, and revocation |
| Agent/tool traces, approvals, audit log | Sensitive content and authorization record |
| Local API port and browser origin | Local network attack surface and request authority |
| Backups and exports | Portable copies of the complete vault; disclosure enables offline attack |
| Package registry/build/release artifacts | Supply-chain integrity and update trust |

## Actors and assumptions

### In-scope adversaries

- A malicious or compromised website attempting cross-origin requests to the
  loopback API, DNS rebinding, or browser-origin confusion.
- Malicious prompt/document/tool output trying to induce an agent to disclose
  data or perform unauthorized actions.
- A malicious, vulnerable, or overprivileged plugin, provider adapter, or
  dependency.
- A remote provider receiving data explicitly submitted to it, including
  provider-side retention or compromise.
- A person with access to encrypted files/backups attempting offline password
  guessing, tampering, or rollback.
- An untrusted LAN peer or sync relay attempting to inspect, replay, corrupt,
  substitute, or withhold sync data.
- Accidental exposure through logs, debug reports, crash output, analytics, or
  broad network permissions.

### Out of scope or not fully mitigated by the current local prototype

- Malware or an administrator-level attacker on the user's device.
- A compromised browser runtime, browser extension with broad page access, or
  malicious code executing in the unlocked application origin.
- Coercion, shoulder surfing, physical theft while an unlocked session is
  visible, or physical access to unlocked devices.
- Provider-side retention, account compromise, or a provider intentionally
  using submitted content outside its stated policy.
- Availability of the operating system, browser, device storage, network, or
  external services.

These are not reasons to ignore defense-in-depth; they constrain claims. A
local lock screen is not equivalent to a server-enforced authentication
boundary, and browser-side encryption cannot defend against active code in the
same origin after unlock.

## Trust boundaries and data flow

1. **Browser locked/unlocked boundary:** While locked, the application should
   not retain the usable vault key in app state. On unlock, the password is
   derived in a worker and a non-extractable data key is imported. V3 clears
   the in-memory key on successful lock after a final encrypted save.
2. **Browser to loopback API:** The browser sends validation keys and chat
   payloads to the local Express service. V3 checks Host and mutating-request
   Origin, emits security headers, limits JSON size, avoids CORS, and binds the
   API to loopback. This narrows but does not eliminate local browser attack
   surface.
3. **API to provider:** Validation sends the submitted key to provider model
   discovery. Chat sends messages/options and the selected saved key to the
   provider. This is an intentional disclosure to the selected provider.
4. **Browser persistent storage:** Chat/settings payloads are AES-GCM
   encrypted before IndexedDB writes. Setup/verifier metadata and lockout
   counters are also stored in IndexedDB. V3 uses PBKDF2 and keeps one
   encrypted JSON payload, rather than a random wrapped master key or
   field-level encryption.
5. **API persistent storage:** The local service encrypts saved keys using a
   separate environment-provided 32-byte key and writes ciphertext/metadata
   to a local JSON file. The API key is decrypted only server-side for provider
   requests.
6. **Export/import boundary:** A backup is a portable encrypted JSON document;
   its confidentiality depends on a strong backup password and correct
   handling of the exported file.
7. **Future optional boundaries:** Plugins/tools, local inference, filesystem
   access, sync relays, WebDAV/S3, desktop IPC, CLI, and telemetry do not yet
   exist. Each must have an explicit capability, approval, and data-flow
   policy before implementation.

## Current controls

- API binds to `127.0.0.1`; Vite UI defaults to `127.0.0.1` and has an explicit
  `CONDUIT_EXPOSE=1` LAN opt-in.
- API rejects non-local Host names and requires allowed local Origins for
  non-GET requests. CORS is not enabled.
- API responses use restrictive CSP, no-store, frame denial, no-referrer, and
  MIME-sniffing protections. Production/preview static assets have CSP and
  related headers. PWA runtime caching is empty and API navigation fallback is
  excluded.
- API JSON body size is bounded; validation is rate-limited; validation
  candidates expire; connection store mutations are serialized.
- Provider keys are encrypted at rest with AES-256-GCM and masked in the UI.
  Encryption key parsing requires canonical Base64 for exactly 32 bytes.
- Provider message/error/stream handling includes API-key redaction. Tests
  check keys are absent from returned errors/prompts and server error logs are
  generic.
- Browser vault values use AES-GCM; password KDF work runs in a worker;
  auto-lock and explicit lock exist; migration/password replacement use an
  atomic IndexedDB transaction.
- Password lockout is persisted locally and is explicitly documented as a UX
  guardrail, not an authentication boundary.
- Backups are versioned, encrypted, and tested for round-trip, bad password,
  malformed format, and merge behavior.
- Credential-reference example values remain in page memory and do not call
  external APIs.
- Tests and the browser smoke test mock the provider/API boundaries rather than
  using real credentials.

## Threats, mitigations, and remaining work

| Threat | Current mitigation | V4 requirement / residual risk |
|---|---|---|
| Website forges requests to local API | Loopback binding, Host checks, Origin allowlist, no CORS, rate limits | Keep strict allowlists; add tests for browser-specific edge cases and cross-platform behavior; do not treat Host/Origin checks as authentication |
| Provider key leaks through UI/API/error/log | Key never returned as plaintext; masking/redaction; generic server logging; tests | Add secret-pattern scanning, structured redaction, audit of all plugin/agent/debug paths, and no secret-bearing traces |
| Offline vault guessing | PBKDF2 210k SHA-256, random per-vault salts | Upgrade via tested PBKDF2-to-Argon2id migration; document parameters and legacy compatibility; backups remain guessable offline |
| Local process reads provider-key file | AES-GCM file encryption; key supplied via local environment | Desktop OS keychain; fallback key handling; OS permissions; per-key budgets; local admin malware remains out of scope |
| Vault corruption/tampering | AES-GCM authentication; schema checks; atomic IndexedDB write for initialization | Fuzz import/SSE parsing; versioned migrations with backup/rollback; anti-rollback limits need design |
| Loss during schema/KDF migration | Atomic V3 migration tests and user-exportable encrypted backup | Snapshot/verify/rollback for every migration; test real V3 fixtures and upgrade on all platforms |
| Prompt injection in retrieved/tool output | No general agent/tool execution exists in V3 | Track 4 must taint tool output, require per-tool approvals, enforce budgets/allowlists, and test hostile payloads |
| Malicious plugin reads local data or contacts network | No plugin runtime exists | Capability-only manifest; isolated worker/iframe; signed/reviewed install; no ambient network/storage; tested denial of capabilities |
| Sync relay reads or alters data | No sync exists | E2E encryption, per-device identity, integrity/authentication, replay protection, revocation, conflict tests; relay must receive ciphertext only |
| Search/index exposes private content | No RAG/index exists | Encrypt at rest, keep local by default, avoid embedding/content transmission without consent, explain source scope and deletion |
| Supply-chain or update compromise | npm lockfiles; CI on Node 20/22; static code security controls | Multi-OS CI, license review, audit/OSV, SBOM, signed/provenance releases, reviewed updates |
| Remote font/CDN/analytics silently tracks users | No analytics requirement; inspect runtime request sources before release | Enforce no remote runtime assets by CSP/tests and add transparent Network Activity view before adding optional outbound integrations |
| Secret committed to repository history | `.env` patterns are ignored and current root `.env` is absent/untracked | Historical tracked root `.env` path exists in Git history. Rotate every real credential that may have appeared there and arrange history scrubbing; current-tree deletion alone does not revoke secrets |
| Theft of backup/export | User-chosen backup password and AES-GCM | Strong-password guidance, integrity tests, safe temporary handling; backup file is portable and may be copied outside app control |
| Lock bypass in browser profile | Password lock and delayed attempts | Treat as privacy UX only; passkeys/recovery improve usability but same-origin active code can still access unlocked data |

## V4 security invariants

1. No analytics, remote fonts/CDNs, or background content transfer by default.
2. Network activity is user initiated, consented, and described in a visible
   activity surface with destination, purpose, and content category.
3. Sync is off by default; provider keys are excluded from sync unless the user
   separately opts in.
4. Tool and plugin outputs are untrusted input. Permissions are scoped,
   revocable, auditable, and deny-by-default.
5. Local model, GPU, retrieval, plugin, and desktop features are optional.
   Turning them off or failing to initialize them does not break basic chat.
6. Every persistent format is versioned. Migrations preserve source until the
   target is validated; backup/rollback is exercised in tests.
7. No tests use real keys or make unmocked provider/sync requests.
8. Debug reports and logs exclude prompts, documents, tokens, passwords,
   connection keys, and recovery secrets by construction.

## Incident response notes

- If any provider/API credential was present in the historical root `.env`,
  rotate/revoke it immediately. Removing a file from the current tree is not
  enough to invalidate exposed credentials.
- Before rewriting shared history, coordinate with repository collaborators
  and hosting policy; history cleanup requires a planned force-update and does
  not replace credential rotation.
- If the local `CONDUIT_ENCRYPTION_KEY` is lost, saved connection records may
  be unrecoverable. Keep protected recovery copies outside the repository.
- If a vault password is lost, encrypted browser data/backup is not recoverable
  without that password; V4 recovery-key behavior is an explicit design item.
