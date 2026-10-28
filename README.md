# CONDUIT

CONDUIT is a local credential reference and session workspace. Browse common API key and token types, see how each is used, and enter credentials into a temporary in-memory session.

## Requirements

- Node.js 20 or newer

## Run locally

```powershell
npm install
npm run dev
```

Open the Vite URL printed in the terminal (normally `http://localhost:5173`).

## Credential workspace

The catalog includes public/publishable and secret/private keys; restricted, read-only, read-write, and admin keys; sandbox and production keys; OAuth access and refresh tokens, JWTs, personal access tokens, and temporary credentials; key ID/secret pairs, service account keys, and webhook signing secrets. Optional IP, domain/referrer, mobile app, and rate-limit/quota restrictions are included as provider configuration references.

Values added to the workspace remain in the current page's memory only. They are not sent to a server or saved to browser storage, and they are removed when the page is reloaded or closed. The workspace is a reference tool: it does not verify credentials with providers or enforce restrictions. Do not enter production secrets into a device or browser you do not trust.

## Build and test

```powershell
npm run build
npm test
```