# ADR 001: Incremental Workspace and Typed API Boundary

- Status: Accepted for Track 0 implementation
- Date: 2026-10-31
- Scope: Workspace/tooling foundation, shared contracts, and API migration

## Context

CONDUIT began with two npm package roots: the primary React/API app in
`frontend/conduit` and the credential reference app at repository root. The
primary app has moved to `apps/web`; the credential-reference app is now the
`packages/credential-reference` workspace and is shared by the standalone and
embedded entry points. The repository has a pnpm workspace and lockfile. The
apps retain separate Vite configs. The Express API is loopback-only and
already has Host/Origin checks, security headers, rate limiting, and
provider/stream behavior covered by tests. Existing user data is stored at
paths relative to the frontend package working directory; physically moving
the API changes that default unless compatibility is handled explicitly.

V3 also has IndexedDB and local connection-file data that must remain readable.
Track 0 must not turn a package extraction or API rewrite into a data migration.

## Decision

1. Adopt a pnpm workspace and Turborepo task graph, with the target layout
   `apps/web`, `apps/desktop`, `apps/cli`, and shared packages. Move code in
   small, tested steps; do not remove the existing implementation until its
   replacement passes behavior and data-compatibility gates.
2. Use Hono for the new typed HTTP boundary and Zod schemas for runtime
   validation. Use the Hono OpenAPI integration and a generated TypeScript
   client. Keep the existing Express routes operational during migration; the
   new boundary is opt-in behind a feature flag until route and security
   contract tests pass.
3. Keep the current Vite/React browser app as the first workspace application.
   Desktop and CLI workspace entries may be placeholders until their
   respective tracks; they must not introduce runtime dependencies into web.
4. Extract shared provider/chat/storage contracts before extracting business
   logic. The credential-reference catalog and view must have one source of
   truth and preserve the current no-network, in-memory-only behavior.
5. Preserve the existing V3 connection-file location while packaging changes.
   The moved API resolves the repository root from its module path and defaults
   to `frontend/conduit/data/connections.json`; `CONDUIT_DATA_DIR` is an
   explicit override. Any later move must read or migrate the old file without
   silently reinitializing an empty store.
6. Keep current npm commands available as compatibility wrappers until the
   pnpm bootstrap, tests, and CI use the workspace commands successfully.

## Alternatives considered

### Fastify

Fastify is a mature Node server with a broad plugin ecosystem and established
schema/serialization patterns. It is a reasonable alternative, but its plugin
and schema integration would require a separate selection for OpenAPI and
typed-client generation. Hono provides a smaller, direct route/API surface
that can be introduced alongside Express without replacing the existing
server at once.

### Keep Express and add only handwritten TypeScript types

This minimizes immediate dependency and migration work, but TypeScript types
do not validate untrusted JSON at runtime and do not provide the requested
generated OpenAPI/client contract. It does not meet the Track 0 boundary goal.

### Replace Express in one migration

This would reduce duplicate route code sooner but creates unnecessary risk to
local key storage, API security controls, streaming behavior, and existing
clients. The dual-path transition is temporary and guarded by parity tests.

### Move all source directories immediately

This would make the repository resemble the final target quickly, but changes
working directories, default data paths, aliases, and a large number of test
imports in one step. Incremental workspace inclusion is safer and gives each
move a reviewable rollback.

## Consequences

### Positive

- A runtime-validated contract and generated API surface can be tested without
  disrupting the current Express API.
- The V3 implementation remains a known-good fallback while the new boundary
  is verified.
- A centralized workspace makes package ownership and dependency direction
  explicit.
- Explicit data-path compatibility prevents package layout from silently
  hiding saved connections.

### Costs and risks

- Temporary duplicate API routes and compatibility commands must be removed
  deliberately after parity is established.
- Hono, Zod, OpenAPI generation, pnpm, and Turborepo add tooling and dependency
  surface. Before addition, verify package licenses, maintenance, Node support,
  and lockfile impact; document size/maintenance rationale in the focused
  implementation commit.
- Browser and server Zod schema imports must not pull Node-only modules into
  the browser bundle.
- The workspace migration may expose previously implicit root-relative paths;
  tests must use an isolated temporary data directory and include the legacy
  path behavior.

### Dependency review

Zod 4.6.6 is MIT-licensed and is used at shared storage/API boundaries; its
published package is about 6.15 MB unpacked. The upgrade from Zod 3 was
required after the moderate audit identified a high-severity advisory affecting
versions below 4.6.6. Hono 4.13.14 (about 1.30 MB), `@hono/node-server`
2.1.5 (about 138 KB), and `@hono/zod-openapi` 1.6.3 (about 121 KB) are
MIT-licensed and server-only; none is included in the browser bundle.
`openapi-typescript` 7.13.0 is MIT-licensed, about 878 KB unpacked, and
development-only. These packages avoid native bindings and provide the
requested runtime contracts, OpenAPI generation, and typed API surface. Their
exact resolutions are captured in `pnpm-lock.yaml`.

## Feature-flag and test plan

- Keep V3 Express as default until the new Hono router proves route parity.
- Add a server-side flag for selecting the new API router; disabled mode must
  preserve current Express behavior.
- Add contract tests for request validation, response shapes, Host/Origin
  policy, rate limiting, headers, key redaction, streaming, and cancellation.
- Test browser code against the generated client with mocked fetch only.
- Validate the current V3 IndexedDB fixture and legacy connection store
  location before any move or format change.

## Revisit when

- OpenAPI client generation or streaming behavior cannot be kept type-safe with
  Hono without excessive custom adapters.
- Hono's license, maintenance, platform support, or package size fails the
  dependency review.
- A measured deployment/runtime requirement favors Fastify.
- A new storage layer needs to own connection persistence; update the
  compatibility plan before changing the old data path.
