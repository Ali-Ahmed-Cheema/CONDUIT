# CONDUIT V4 Roadmap

**Status:** Proposed execution plan
**Baseline:** V3 repository state inspected on 2026-10-31
**Release goal:** A local-first, privacy-preserving AI workspace platform that
retains useful V3 behavior and works offline, without a GPU, and with one
provider key.

## Principles and delivery rules

- Local and private by default. An external provider, search, sync, plugin,
  update, or telemetry destination is never implicit.
- Preserve the V3 browser vault, saved chats, backups, and provider connections.
  No storage/key-format migration ships without a tested backup/rollback path.
- Add functionality beside the V3 path; gate optional modules with centralized
  feature flags and make disabled/failed modules harmless.
- Keep provider/network tests mocked. Never require secrets in CI.
- Every track begins with an ADR and a concise design review. Its exit
  criteria, tests, docs, and user-operational steps are recorded before moving
  to the next track.
- Keep commits focused and track-specific. Record test/build/coverage/size/
  performance numbers only when measured.
- Check dependency license, maintenance, size, platform support, and security
  implications before adoption. Do not silently add heavyweight ML, database,
  desktop, or sandbox dependencies.

## Starting-point adjustments

The repository has progressed beyond the original V3 description. Before
planning new work, the current tree already contains first-run vault setup,
random per-vault PBKDF2 salts, tested legacy-vault migration, password change,
encrypted versioned backup import/export, browser lockout persistence,
provider retry/status handling, API Host/Origin checks, security headers,
rate-limited validation, server tests, component tests, a Playwright smoke
test, and Node 20/22 CI. These features should be retained, not reimplemented.

The root `.env` is absent from the current tree, is ignored by `.gitignore`,
and is not tracked at HEAD. The path does exist in Git history. Rotate any real
credentials that were ever present and coordinate history scrubbing; this
roadmap does not rewrite shared history.

During Track 0 migration, the frozen pnpm workspace install succeeded. The
latest local verification passed 155/155 Vitest tests, the Playwright smoke
test 1/1, lint, typecheck, direct production builds of `apps/web` and
`packages/credential-reference`, and OpenAPI/client regeneration checks. The
web app's largest initial JS chunk is 117.50 KB gzip; chat is lazy-loaded at
67.68 KB gzip. Dependency audit reports one low-severity advisory; CycloneDX
output includes all ten workspaces and their installed dependency closure
(2,997 components). The API feature flag and shared Zod contracts are
implemented; Hono currently exposes only the health/OpenAPI routes, and
Express remains the default. Core, providers, crypto primitives, IndexedDB
storage, shared UI components, and credential reference are extracted. This is
a migration checkpoint, not a Track 0 exit result. The aggregate Turbo build
command could not resolve a standalone `pnpm` binary from this local
Corepack-only PATH; both app workspace builds passed directly. CI has the Node
20/22 Linux/macOS/Windows matrix, but it has not run against the current
uncommitted tree. Agent, RAG, and plugin SDK runtimes; desktop and CLI
application packages; full route parity; broad API/storage schema coverage;
and browser-level V3 fixture migration verification still need completion.
Agent, RAG, and plugin SDK currently have schema scaffolding only.
Encrypted password/device fixture merging and atomic rollback are covered by
local storage tests.

Recommended sequencing adjustments:

1. Track 0 remains the foundation, but do not move V3 code all at once. Add
   workspaces/packages incrementally and preserve the current app until the
   migration smoke tests pass.
2. Track 1 is a high-risk storage/key migration. First build a measured V3
   fixture corpus and migration harness. Keep an encrypted backup and
   rollback path before any new database becomes authoritative.
3. Track 2 should introduce a normalized provider contract and one local
   OpenAI-compatible provider (Ollama) before expanding the registry. Avoid
   downloading models as a prerequisite to installing/using the app.
4. Tracks 3–6 should share the permission, schema, audit, and network-activity
   foundations from Tracks 0–1. Tools, agents, plugins, and RAG are
   security-sensitive; do not combine them in a single release.
5. Track 7 remains opt-in and follows local key hierarchy/migration work.
   Track 8 desktop keychain/store ownership depends on the Track 1 key design.
6. Tracks 9–11 are cross-cutting. Quality/security/documentation gates begin
   in Track 0; their final comprehensive exit checks are completed after the
   capabilities they measure exist.

## Track 0 — Foundation re-platform

### Design and implementation

- Establish pnpm workspace/Turborepo layout for `apps/web`, `apps/desktop`,
  `apps/cli`, and shared packages for core schemas, providers, crypto, storage,
  agents, RAG, plugin SDK, UI, and credential reference.
- Move the root credential catalog/UI into a single package and retain its
  current page-memory-only behavior.
- Introduce runtime schemas at API, storage, import/export, provider, plugin,
  and tool boundaries; infer TypeScript types from schemas. Keep strict TS and
  avoid `any`.
- Define a loopback-only typed API, OpenAPI generation, and typed client.
  Preserve/strengthen Host and Origin checks, rate limits, strict headers, and
  explicit user initiation.
- Add workspace lint/typecheck/test/build commands, Changesets,
  commitlint/Husky/lint-staged, CI matrix for Node 20/22 on Linux/macOS/
  Windows, dependency audit, CycloneDX SBOM, and OSV scanning.
- Centralize feature-flag evaluation and prove disabled modules do not load or
  issue requests.

The credential-reference catalog and UI are now in
`packages/credential-reference`; the main app embeds the package and its
standalone Vite entry point uses the same source. Track 0 remains in progress.

### Data and compatibility gate

Keep the current web and API paths available while packages are extracted.
Build a non-secret V3 IndexedDB fixture and a mocked encrypted connection
fixture. Test import/open/migration using a copy; do not test against a user's
only profile. Compare chats, messages, settings, connection metadata, backup
round trips, and failure rollback. Leave provider credentials out of browser
migration fixtures.

### Exit criteria

- One-command clean bootstrap and documented local run.
- CI green on Linux, macOS, and Windows for Node 20/22.
- V3 fixture opens in the new application with no lost records, with a tested
  rollback/backup path.
- Credential reference has one source of truth.
- Generated OpenAPI and client are reproducible and checked by CI.
- Every optional V4 module has a tested disabled/unavailable path.

## Track 1 — Storage and security engine

### Proposed work

- Replace one encrypted JSON blob with structured/queryable storage for chats,
  messages, files, memories, prompts, agents, and documents; add indexes and
  full-text search.
- Design the browser backend (SQLite WASM + OPFS) and desktop/server backend
  (SQLite implementation) behind one storage interface. Introduce schema-
  versioned migrations.
- Use a random master data key wrapped by password-derived KEK; support
  password changes by rewrapping the master key. Investigate optional passkey
  PRF and printable recovery material with clear browser/platform constraints.
- Migrate PBKDF2 vaults to Argon2id without making legacy data unreadable.
- Add in-app secure first-run, auto-lock, best-effort key clearing, clipboard
  handling, panic wipe, encrypted streaming backups, and desktop scheduled
  backups.
- Use desktop OS keychain for provider keys when available, encrypted file
  fallback otherwise; add per-connection usage limits and spend caps.
- Add tamper, KDF, migration rollback, parser fuzzing, CSP, and secret-pattern
  tests.

### Decision gate

SQLite WASM/OPFS, native SQLite, Drizzle, Argon2id WASM, WebAuthn PRF, and
keychain libraries have meaningful size, browser/platform, licensing, or
recovery tradeoffs. Record an ADR and review license, maintenance, bundle
impact, platform support, schema ownership, migration rollback, and fallback
behavior before installing them. Do not replace current storage until the
V3-to-new-store fixture migration and restore path pass.

### Exit criteria

- 100k-message search under 100 ms on a documented reference machine, measured
  by a reproducible benchmark.
- Wrong-password, tamper, V3 migration, rollback, backup restore, and password
  rewrap tests pass.
- No plaintext chat data or provider keys are persisted in the new store.
- Optional passkey/recovery/native keychain failure does not block password
  vault access.

## Track 2 — Provider platform

### Proposed work

- Create a declarative, typed provider registry with capabilities, context,
  modalities, pricing, tool/JSON support, and normalized streaming events.
- Add local endpoints/models: Ollama first, then LM Studio, llama.cpp server,
  and vLLM; later Azure OpenAI, Bedrock, Cohere, Together, Fireworks,
  DeepSeek, xAI, Perplexity, and custom OpenAI-compatible endpoints.
- Add opt-in in-browser WebGPU inference with size/RAM/VRAM checks and model
  download/cache management; add managed llama.cpp sidecar for desktop only
  after platform review.
- Add routing fallback chains, per-task defaults, bounded retries before first
  byte, circuit breakers, and transparent cost/latency policy.
- Add tokenizer-backed usage and a local cost ledger/budget alerts.

### Exit criteria

- One conversation works through a cloud provider and a fully offline local
  provider.
- Mocked e2e proves provider A failure falls back to B and cancellation works.
- Provider conformance fixtures cover normalized deltas, errors, usage, and
  provider-reported model.
- No model download occurs without clear user initiation and storage consent.

## Track 3 — Advanced chat experience

- Add conversation trees, edit/resend, regenerate, branch comparison, and
  multi-model arena with per-model latency/usage/cost and saved votes.
- Add attachments (image/PDF/audio/files), drag/drop/paste/camera, worker-based
  parsing, and capability-aware vision/audio provider flows.
- Add local/optional voice input and speech output with interruption.
- Add sandboxed artifacts (code, HTML, SVG, Mermaid, charts, React previews)
  in an iframe with no network and strict message protocol.
- Add user-approved Python/JS execution in resource-limited isolated workers.
- Add KaTeX, syntax highlighting, table CSV/XLSX export, citations, collapsible
  reasoning, prompt library, slash commands, snippets, personas, and command
  palette.
- Add full-text/semantic chat search, titling, tags, summaries, and
  context-window compression.

**Exit:** Every feature is keyboard operable; a 10k-message conversation stays
at 60 fps in a measured browser test. Sandbox execution is opt-in and isolated.

## Track 4 — Tools, MCP, and agents

- Define typed tools with schemas, parallel execution, allow-once/always/never
  permissions, audit trail, and dry run.
- Add MCP with per-server permission scopes, reviewed transports, discovery,
  and process isolation appropriate to web/desktop.
- Add opt-in search, URL fetch/readability, calculator, isolated code
  interpreter, user-granted filesystem, date/time, and local RAG tools.
- Implement bounded/resumable plan-act-observe agent loops, cancellation,
  human approval, step/token/cost limits, and inspectable traces.
- Add visual workflow editor/import/export/scheduling only after runtime
  permission model is stable.
- Defend against prompt injection via content-origin labeling, treating tool
  output as untrusted, domain allowlists, and approval for sensitive actions.

**Exit:** A mocked offline research-and-write workflow produces an inspectable
trace and demonstrates enforced step/token/cost budgets and approvals.

## Track 5 — Knowledge, memory, and RAG

- Import PDF, DOCX, Markdown, text, web pages, and user-selected folders with
  worker-based parsing and explicit network consent for web pages.
- Add configurable chunking and metadata, local embeddings with optional
  provider fallback, encrypted vector index, hybrid BM25/vector retrieval,
  and reranking.
- Return passage-level citations and explain why a source was selected.
- Add user-controlled encrypted facts/preferences; automatic memory is a
  proposal that requires approval, with view/edit/delete and project scope.
- Add projects/workspaces grouping chats, files, prompts, agents, and settings.
- Test recall@k/MRR against a bundled non-sensitive corpus.

**Exit:** Questions over a 500-page test corpus are answerable offline with
measured citation quality; incremental re-index and deletion are verified.

## Track 6 — Plugin and extension platform

- Version a plugin SDK for tools, providers, UI panels, slash commands, themes,
  importers, and exporters.
- Require a manifest declaring permissions; run code in a worker/iframe
  capability sandbox with no ambient network/storage.
- Add local installation, permission review/revocation, signature policy, and
  contract tests.
- Ship sample plugins (read-only GitHub issues, export, RSS, Pomodoro/notes,
  theme) and a scaffold CLI plus contributor guide.

**Exit:** A sample third-party-style plugin installs with review, runs
sandboxed, and tests prove it cannot exceed granted capabilities.

## Track 7 — Opt-in encrypted sync

- Choose a CRDT through an ADR and model versioned conversations, settings,
  and prompts.
- Add opt-in self-hosted relay and/or WebDAV/S3/local-network transport; relay
  stores ciphertext only.
- Pair devices by QR + short authentication string, provision per-device
  keys, support revocation, offline queue, conflict display, and selective
  sync.
- Keep provider keys excluded unless a separate explicit opt-in is chosen.
- Document zero-knowledge claims and metadata leakage in the threat model.

**Exit:** Two browser profiles converge after offline edits; relay inspection
finds only ciphertext; replay, tamper, revoke, conflict, and selective-sync
tests pass.

## Track 8 — Desktop, PWA, CLI, and distribution

- Add Tauri 2 desktop shell, native menu/hotkey/tray/deep links/file
  associations, OS keychain, signed auto-update, and managed model/MCP
  sidecars.
- Harden PWA offline shell, explicitly user-approved queued work, share target,
  and installation. Never cache provider responses or secrets.
- Add `apps/cli` for chat/ask, stdin/stdout, workflows, connection management,
  and backup import/export on shared encrypted store.
- Consider an optional local OpenAI-compatible gateway only with explicit
  enablement and auth token, loopback-only by default.
- Produce reproducible, signed Windows/macOS/Linux builds, checksums,
  provenance; add relay/headless Docker artifacts only when needed.

**Exit:** Signed desktop build installs and updates with signature
verification; desktop e2e passes on supported OSes; CLI shares storage without
plaintext credential files.

## Track 9 — Observability, evaluation, and quality

- Keep telemetry local-only by default; add redacted structured logs, opt-in
  OpenTelemetry export, local diagnostics, and content-free debug report.
- Add prompt/model evaluation harness with datasets, schema/exact/regex
  assertions, optional judge, comparisons, and mocked CI.
- Build unit/component/API/e2e/a11y/visual/property/fuzz/load suites.
- Enforce coverage targets for core/crypto/storage/providers, shell bundle
  budget, Lighthouse goals, and search/streaming performance budgets.

**Exit:** CI blocks regressions on measured coverage, shell bundle size,
accessibility, security, and performance budgets.

## Track 10 — UX, accessibility, and localization

- Build shared tokens/components, density/theme/high-contrast/reduced-motion
  modes, Storybook docs, and component contracts.
- Add ICU localization and RTL; ship English and Urdu. Keep Asia/Karachi as
  default but make timezone configurable.
- Meet WCAG 2.2 AA with focus management, live streaming announcements,
  keyboard shortcuts/help overlay, and layouts down to 360 px with safe-area
  and on-screen-keyboard support.
- Add onboarding, empty states, and a local help center sourced from docs.

## Track 11 — Documentation and community

- Maintain quick start, architecture, threat model, guides, provider/plugin
  docs, generated API docs, SECURITY disclosure policy, contributing guide,
  code of conduct, changelog, templates, and public roadmap.
- Keep copilot instructions synchronized with workspace boundaries, tests,
  security, and migration process.

## Cross-track gates and measurements

Every track must report:

- Shipped behavior and feature flag/default state.
- Changed files and focused commit(s).
- Test and typecheck/lint/build results; coverage where configured.
- Bundle/performance figures only when measured on a named environment.
- Migration/rollback evidence when storage or key formats change.
- Known gaps, dependency license/maintenance/size justification, and manual
  actions (secret rotation, signing keys, hosted services, store accounts).

Required global defaults:

- No analytics, runtime remote fonts, or CDN dependencies.
- Every outbound network capability is user initiated, documented, and visible
  in a Network Activity page before release.
- New features are independently disableable and failure does not prevent
  basic offline/local or one-key chat.
- Preserve V3 until the V3 migration gate passes.

## Release readiness and backlog

V4.0.0 is not a single-track release. Do not claim V4 until the workspace,
typed boundary, V3 migration, local model path, core privacy/security
invariants, supported platforms, docs, and release artifacts are complete and
their exit tests pass. Use Changesets and publish a migration guide.

Prioritized V4.x backlog:

1. V4.0 foundation, secure key hierarchy/storage migration, one local model,
   provider registry, accessible chat, and V3 import/export.
2. V4.1 local knowledge/RAG with citations and projects, after retrieval
   quality/erase tests.
3. V4.2 approval-first tools and bounded agents, after red-team fixtures.
4. V4.3 sandboxed plugins and MCP integrations, after capability-enforcement
   tests.
5. V4.4 opt-in E2E sync with device revoke/conflict UX.
6. V4.5 desktop, CLI, signed distribution, and local gateway (off by default).
7. Ongoing: multimodal/voice, model arena, evaluation, localization, and
   performance/a11y refinements, each released behind independent flags.

## Initial baseline checklist

- [x] Read current docs, package manifests, source boundaries, and tests.
- [x] Confirm root `.env` absent and not tracked at HEAD; `.env` remains ignored.
- [x] Restore dependencies from current lockfiles before trusting the full test
      baseline.
- [x] Complete Track 0 ADR and confirm migration/workspace implementation
      choices before introducing heavy dependencies.
- [ ] Rotate any real credentials that appeared in historical `.env` and
      coordinate Git history remediation with repository owners.
