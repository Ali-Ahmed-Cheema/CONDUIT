# CONDUIT V3 Architecture (V4 Starting Point)

**Status:** Observed current implementation, 2026-10-31
**Purpose:** Record the system that V4 work must preserve and migrate from. This
document describes existing code; it is not a claim that the V4 roadmap is
already implemented.

## Product and runtime shape

CONDUIT is currently a local-first, single-device chat application plus a
credential-reference workspace. The repository has two Vite/React entry
points:

- The main chat application is in `frontend/conduit`.
- The standalone credential-reference application is at the repository root.
  The main app embeds the same root workspace and catalog through a Shadow DOM
  host. The catalog is shared in source today, but the application packaging
  and styles are separate.

The root `package.json` and `frontend/conduit/package.json` are separate npm
packages with separate lockfiles. This is not yet a pnpm/Turborepo workspace.
There are no shared `packages/*` contracts yet. Root scripts delegate the main
app's development/build commands to `frontend/conduit`; root Vite serves the
standalone reference application.

```text
Browser
  Main React 19 / TypeScript / Vite app (127.0.0.1:5173)
    HashRouter pages, Zustand state, Markdown/SSE client
    Web Crypto + PBKDF2 worker + IndexedDB encrypted vault
           | same-origin /api proxy
           v
  Express 5 API (127.0.0.1:3001)
    Host/origin checks, security headers, request limits
    encrypted connection file, provider registry/adapters
           | explicit key validation and chat requests
           v
  External model provider

Standalone credential reference (127.0.0.1:5174)
  Root React/Vite app; entered example values remain in page memory.
```

The main web development server and the local API are distinct processes.
Vite proxies `/api` to the loopback API. Both Vite applications bind to
`127.0.0.1` by default; `CONDUIT_EXPOSE=1` opts into binding to all
interfaces. The Express service binds only to `127.0.0.1`.

## Main application

### UI and state

The main React app uses React Router's `HashRouter`, lazy-loaded page modules,
Zustand stores, TypeScript, Vite, Tailwind CSS, and application CSS. Routes
include chat, history, API configuration, settings, About, and the embedded
credential reference. The lock screen gates the normal application shell.

The primary store contains lock state, theme, notification preference,
auto-lock interval, connection metadata, active connection/model, conversations,
and active conversation IDs. Chat content and settings are persisted to the
browser vault. Connection secrets do not live in the browser app store.

Chat requests send only the most recent 30 messages, subject to a 48,000
character budget. The chat UI streams server-sent events, supports cancelling
the current request, handles reported model and usage events, and renders
Markdown/GitHub-flavored Markdown. Displayed token counts are estimates, not
provider-tokenizer counts.

### Browser vault

The current browser store is IndexedDB database `conduit-v3`, database version
2, with a `vault` object store. The logical encrypted payload schema is
`VAULT_SCHEMA_VERSION = 1`, containing keys, chats, and settings. Chat
conversations/messages are validated during migration/read; an unversioned
legacy payload is normalized to schema 1 and written back after successful
decryption.

Each vault payload is JSON encrypted with Web Crypto AES-GCM using a random
12-byte IV. New installations create a random password verifier salt and data
salt in the IndexedDB `setup` record. Password hashing and data-key derivation
use PBKDF2-HMAC-SHA-256 with 210,000 iterations in a Web Worker. The data key is
non-extractable after import and held in application memory while unlocked.
The verifier and vault data are separate records. Lockout state is persisted in
IndexedDB; the old localStorage lockout value has a tested one-time migration.

First-run setup requires a password of at least 12 characters. Older V3 vaults
without an in-app setup record use a legacy verifier/salt configuration. After
the existing password is verified, the app decrypts the old data and writes
the new setup and ciphertext in one IndexedDB transaction. Existing tests
assert that a failed atomic replacement leaves the prior data/setup intact.
Password changes follow the same decrypt-then-atomic-replace pattern. A future
key-hierarchy migration must preserve this compatibility path and the
transaction/backup guarantees.

Encrypted backups use JSON format `CONDUIT_VAULT_BACKUP`, format version 1,
PBKDF2-SHA-256, 210,000 iterations, a fresh salt, and AES-GCM ciphertext.
Imports support merge and replace. Merge replaces duplicate record IDs with
imported versions while retaining unmatched local records. Current tests cover
round-trip confidentiality, incorrect passwords, invalid formats, merge
semantics, old logical payload migration, and failed setup replacement.

### Local API and provider calls

`frontend/conduit/server/index.ts` exports an Express app for tests and starts
the server on loopback. `server/securityHeaders.ts` defines API and static
response headers. The API middleware:

- Sets a restrictive CSP, `no-store`, `Referrer-Policy`,
  `X-Content-Type-Options`, and `X-Frame-Options`.
- Accepts only `localhost` and `127.0.0.1` Host names.
- Requires non-GET requests to have a configured localhost app/API Origin.
- Does not enable CORS.
- Parses JSON with a 64 KB limit.
- Applies in-memory per-path/per-IP rate limiting on key validation.
- Uses a serialized mutation queue for connection store writes.

Routes cover health, connection listing, provider key validation, adding,
replacing, refreshing, selecting, and deleting connections, plus streaming
chat. Unknown provider keys require consent before sequential probing. Key
validation has a 15-second provider timeout and temporary candidate IDs expire
after 30 minutes. Provider chat retries transient failures before the first
non-empty stream chunk, with bounded attempts and backoff. Chat request
validation limits message counts and generation options. The server redacts
known API keys from user messages before provider forwarding and from provider
errors/deltas before returning data to the UI.

`server/providers.ts` contains the current explicit adapters for OpenAI,
Anthropic, Google Gemini, Groq, OpenRouter, Hugging Face Inference Providers,
and Mistral. There is no declarative capability/pricing registry or local-model
adapter yet. Models are discovered from provider endpoints and filtered for
chat suitability. Streaming provider formats are normalized into text,
model, usage, error, and completion events consumed by `src/api.ts`.

`server/keyStore.ts` stores connection metadata and AES-256-GCM encrypted API
keys in `frontend/conduit/data/connections.json`. The key is a canonical
Base64-encoded 32-byte `CONDUIT_ENCRYPTION_KEY`, loaded from environment
configuration. Each key ciphertext uses its own random 12-byte IV and GCM tag.
Writes use a temporary file followed by rename and set restrictive file mode
where supported. The public connection response excludes encrypted key
material and returns a masked hint.

Provider use intentionally crosses the device boundary: key validation sends
the candidate key and chat sends the user-selected conversation to that
provider. The standalone credential-reference app does not make provider or
other network requests.

## Credential-reference workspace

The root app uses React, TypeScript, Vite, and its own stylesheet. Its 16
credential examples are defined in `src/credentialTypes.ts`; the
`CredentialWorkspace` in `src/App.tsx` provides search, group filters,
credential entry forms, secret reveal controls, removal, and educational
security/HTTP response guidance. Values are held in React state only and are
not sent to an API or persisted. The main app's `src/pages/Credentials.tsx`
mounts this workspace into a Shadow DOM and injects its stylesheet.

V4 Track 0 proposes a single shared credential-reference package as the
replacement for the current root-app packaging. The migration should retain
the catalog's privacy promise and avoid introducing a second copy.

## Build, test, and delivery

Current commands are npm scripts:

- `npm run dev`: start main UI and API.
- `npm run dev:reference`: start the standalone reference UI.
- `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:e2e`,
  `npm run build`.

Root CI currently tests Node 20 and 22 on Ubuntu, runs lint/typecheck/unit
tests, installs Playwright Chromium, runs e2e, then builds. Cross-OS CI,
workspace-aware package tooling, dependency auditing, SBOM, and OSV scanning
are planned, not current guarantees. The current unit suite uses Vitest; the
Playwright smoke test mocks provider/API network requests and covers first
setup, chat, lock/unlock persistence, accessibility, and a narrow viewport.

## Important compatibility contracts

1. Existing V3 chat data must be readable after any V4 storage change.
2. No migration may delete or overwrite the only valid user copy before the
   replacement has been validated and committed. Keep a recoverable encrypted
   backup or an atomic rollback path.
3. Keep the current V3 web experience operational while new modules are
   introduced behind flags.
4. Never persist provider plaintext keys in the browser vault or return saved
   key ciphertext to the browser.
5. Provider, search, sync, plugin, update, and other network activity must be
   explicit, visible, and initiated only by the relevant user action or
   separately approved feature.
6. Tests must use mock credentials and mocked network boundaries.

## Gaps to address in V4

- Two npm applications are not a shared package workspace; types and contracts
  are currently handwritten and are not runtime schema-validated everywhere.
- Browser persistence is an encrypted JSON payload, not a queryable relational
  store; retrieval and large-scale full-text/vector search do not exist.
- PBKDF2 and legacy static verifier compatibility remain; no wrapped random
  master key, passkey PRF, recovery key, or memory-zeroization guarantee exists.
- Provider keys are encrypted in a local JSON file, not held in an OS keychain.
- Provider capabilities, exact tokenizers/pricing, local model execution,
  routing chains, tools, agents, MCP, projects, RAG, and plugins are absent.
- No multi-device encrypted sync or conflict model exists.
- No desktop application or CLI exists; the PWA is the only installable app.
- V3-local security controls do not protect against local malware, a compromised
  browser/extension, or hostile code running in an unlocked origin.
- A root `.env` was removed from the current revision and `.env` paths are
  ignored. Historical commits may still contain the prior file; credential
  rotation and history remediation are owner actions.
