# CONDUIT V3

CONDUIT is a local API credential reference and session-only input workspace. It explains common credential types and lets you enter sample credentials to organize them in the current browser session.

## Requirements

- Node.js 20 or newer
- npm

## Run locally

```powershell
npm install
npm run dev
```

Open the local URL printed by Vite (normally `http://localhost:5173`). To create a production build, run `npm run build`; to serve that build locally, run `npm run preview`.

## Credential types

The workspace provides input forms for public/publishable keys, secret/private keys, restricted/scoped keys, read-only keys, read-write keys, admin/master keys, test/sandbox keys, live/production keys, OAuth access and refresh tokens, JWTs, personal access tokens, temporary credentials, key ID/secret pairs, service account JSON, and webhook signing secrets.

Each form also includes optional fields for IP addresses, HTTP referrers/domains, app identifiers, and quota/rate-limit notes. These are reference fields only; CONDUIT does not configure restrictions with a provider.

## Important credential handling note

This version is a reference/demo workspace, **not a credential vault or API client**:

- Credential values stay in React memory in the current browser tab. They are cleared when the page is reloaded or closed.
- Values are not encrypted or written to local storage, IndexedDB, files, or a backend.
- The app does not send credentials to a server, call third-party APIs, validate keys, or enforce permission scopes and restrictions.
- Avoid entering real production credentials. Use only disposable test values while exploring the interface.

The examples and descriptions are general guidance. Exact credential behavior and response codes depend on the API provider.
