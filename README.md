# CONDUIT V3.0

CONDUIT is a local, single-device multi-provider chat app. From the repository root, the npm scripts launch the full chat client and its local API service in [frontend/conduit](./frontend/conduit/).

## Requirements

- Node.js 20 or newer
- npm
- An API key from a supported provider to send chat messages

## Run locally

```powershell
npm install
npm run dev
```

Open the Vite URL printed in the terminal (normally `http://localhost:5173`). The dev command starts both the chat UI and the local API service. Use `npm run dev:web` and `npm run dev:api` to run them separately.

The all-types credential reference is still available separately with `npm run dev:reference` (normally `http://localhost:5174`). Its session-only forms are a reference UI; use **API Config** in the chat app to add provider keys for actual conversations.

## Set up chat

The local API service reads its encryption key from `frontend/conduit/.env`. If `CONDUIT_ENCRYPTION_KEY` is not set there, create a private 32-byte key from PowerShell at the repository root:

```powershell
$bytes = [byte[]]::new(32)
[System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
$key = [Convert]::ToBase64String($bytes)
$envFile = "frontend\conduit\.env"
$lines = if (Test-Path $envFile) { Get-Content $envFile | Where-Object { $_ -notmatch '^CONDUIT_ENCRYPTION_KEY=' } } else { @() }
$lines += "CONDUIT_ENCRYPTION_KEY=$key"
$lines | Set-Content -Encoding ascii $envFile
Remove-Variable key, bytes, lines, envFile
```

Unlock the app with the password used to create its local vault verifier. To set a new password, first export or clear any vault data encrypted with the old password. Then run the verifier generator from the app directory and replace the `KDF_CONFIG` values in `src/crypto/config.ts` with its output:

```powershell
Set-Location frontend\conduit
$env:CONDUIT_PW = Read-Host "Choose a private vault password"
npm run generate:verify
Remove-Item Env:CONDUIT_PW
```

After unlocking, open **API Config** and add a real supported provider key. CONDUIT validates it with the provider and stores it encrypted in the local API service. Select the connection and a chat model, return to the chat, and send a message. Provider usage may incur charges.

The local API listens on `127.0.0.1:3001` and the web app normally runs at `http://localhost:5173`.

## Build and test

```powershell
npm run build
npm test
```

`npm run build` builds the chat app. `npm test` runs the repository test suite. Use `npm run preview` to serve the production build locally.

## Security

Provider credentials are sent only to the local API service for validation and chat, then encrypted at rest. Chat history and settings are encrypted in browser storage while the vault is unlocked. Do not expose the local API service to an untrusted network, and do not commit `.env` files or share vault passwords.
