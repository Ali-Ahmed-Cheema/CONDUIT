# CONDUIT V3.0

CONDUIT is a local, single-device multi-provider chat app. The Vite/React client encrypts chat history and preferences in IndexedDB. Its local API service validates provider keys, stores them encrypted at rest, and streams chat responses without sending saved keys to the browser.

## Requirements

- Node.js 20 or newer
- A provider API key for actual chat usage

## Configure the local API service

If `CONDUIT_ENCRYPTION_KEY` is not already set in `.env`, create a 32-byte encryption key and add it there. Keep this value private and do not commit `.env`.

```powershell
$bytes = [byte[]]::new(32)
[System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
$key = [Convert]::ToBase64String($bytes)
$lines = if (Test-Path .env) { Get-Content .env | Where-Object { $_ -notmatch '^CONDUIT_ENCRYPTION_KEY=' } } else { @() }
$lines += "CONDUIT_ENCRYPTION_KEY=$key"
$lines | Set-Content -Encoding ascii .env
Remove-Variable key, bytes, lines
```

The service listens on `127.0.0.1:3001` and writes encrypted connection records to `data/connections.json`.

## Configure the lock-screen verifier

The repository contains only a PBKDF2 verifier, not the lock password. To replace the verifier, set `CONDUIT_PW` to a private password, run the generator, and copy its output to `src/crypto/config.ts`:

```powershell
$env:CONDUIT_PW = "choose-a-private-password"
npm run generate:verify
Remove-Item Env:CONDUIT_PW
```

Do not commit or share the password. Changing the verifier does not migrate data encrypted with the previous password-derived key; export or clear the old vault before changing it.

## Run locally

```powershell
npm install
npm run dev
```

`npm run dev` starts both the API service and Vite. Open the Vite URL printed in the terminal (normally `http://localhost:5173`). Unlock with the password used to generate the verifier, then add a real provider key in **API Config**. The key is validated against its provider before it can be saved.

Supported providers are OpenAI, Anthropic, Google Gemini, Groq, OpenRouter, Hugging Face Inference Providers, and Mistral AI. Hugging Face tokens must have the Inference Providers permission; paste a personal access token beginning with `hf_` and the app will validate it and load the chat models available to that token. Mistral API keys do not have a unique prefix, so enable the consent checkbox when adding one; the local service will check it against the supported providers. Other providers require their own explicit integration; an unknown key can only be probed against the listed providers and is not guaranteed to work just because it is an API key.

Chat messages render Markdown and GitHub-flavored Markdown, including emphasis, lists, tables, and formatted code blocks. Use the copy button on a code block or inline code snippet to copy just that code, the table copy button to copy a table as tab-separated text for spreadsheets, or **Copy response** to copy the complete assistant reply.

To run the services separately, use `npm run dev:api` and `npm run dev:web`.

## Build and test

```powershell
npm run build
npm test
```

`npm run start:api` starts only the local API service. The API service must remain available for validation and chat.

## Security notes

- Provider API keys are sent only to the local API service for validation and chat. Saved keys are encrypted with AES-256-GCM using the private key in `.env`.
- Chat history and settings are encrypted in IndexedDB with AES-GCM. The data-encryption key is held in memory only while unlocked.
- The lock screen, verifier, and local service are intended for a single-device local prototype, not as a production authentication boundary. Do not expose the local API service to an untrusted network.