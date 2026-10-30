# CONDUIT V3.0

CONDUIT is a local, single-device multi-provider chat app. The Vite/React client encrypts chat history and preferences in IndexedDB. Its local API service validates provider keys, stores them encrypted at rest, and streams chat responses without sending saved keys to the browser.

## Requirements

- Node.js 20 or newer
- A provider API key for actual chat usage

## Configure the local API service

Generate a private 32-byte encryption key from the repository root, add it to `.env`, and keep the value private. Do not commit `.env`.

```powershell
# Run from the repository root.
$key = corepack pnpm --silent generate:key
$envFile = ".env"
$lines = if (Test-Path $envFile) { Get-Content $envFile | Where-Object { $_ -notmatch '^CONDUIT_ENCRYPTION_KEY=' } } else { @() }
$lines += "CONDUIT_ENCRYPTION_KEY=$key"
$lines | Set-Content -Encoding ascii $envFile
Remove-Variable key, lines, envFile
```

The API exits with a clear error if the key is missing or is not valid base64 encoding of exactly 32 bytes. Keep it safe: losing it makes saved provider connections unreadable. The service listens on `127.0.0.1:3001` and writes encrypted connection records to `data/connections.json`.

## Set up the vault

On first launch, the app creates a non-extractable AES-GCM key and stores it in the browser's IndexedDB. No password is required to open the workspace. Existing password-protected V3 vault data is not imported into the new workspace and remains encrypted in IndexedDB; export it before upgrading if you need to preserve it.

Encrypted backups use a separate password that you choose when exporting and enter when importing. Imports can merge or replace chats and settings. Keep a backup if you need to move the workspace to another browser or device.

## Run locally

```powershell
corepack pnpm install
corepack pnpm dev
```

`corepack pnpm dev` starts both the API service and Vite. Open the Vite URL printed in the terminal (normally `http://localhost:5173`). The local workspace opens automatically; add a real provider key in **API Config**. The key is validated against its provider before it can be saved.

Supported providers are OpenAI, Anthropic, Google Gemini, Groq, OpenRouter, Hugging Face Inference Providers, and Mistral AI. Hugging Face tokens must have the Inference Providers permission; paste a personal access token beginning with `hf_` and the app will validate it and load the chat models available to that token. Mistral API keys do not have a unique prefix, so enable the consent checkbox when adding one; the local service will check it against the supported providers. Other providers require their own explicit integration; an unknown key can only be probed against the listed providers and is not guaranteed to work just because it is an API key.

Chat messages render Markdown and GitHub-flavored Markdown, including emphasis, lists, tables, and formatted code blocks. Use the copy button on a code block or inline code snippet to copy just that code, the table copy button to copy a table as tab-separated text for spreadsheets, or **Copy response** to copy the complete assistant reply.

To run the services separately, use `corepack pnpm dev:api` and `corepack pnpm dev:web`.

## Build and test

```powershell
corepack pnpm build
corepack pnpm test
```

`corepack pnpm start:api` starts only the local API service. The API service must remain available for validation and chat.

All API keys are saved in the single **Default** environment automatically; no environment setup is needed. The web and reference development servers bind to `127.0.0.1` by default. Set `CONDUIT_EXPOSE=1` before starting a Vite server only when LAN access is intended.

## Security notes

- Provider API keys are sent only to the local API service for validation and chat. Saved keys are encrypted with AES-256-GCM using the private key in `.env`.
- Chat history and settings are encrypted in IndexedDB with AES-GCM. The device vault key is stored in the same browser profile, so this is not a password or authentication boundary: anyone with access to the browser profile or code running in the app origin may access the workspace. Keep an encrypted backup and the API encryption key safe.
- Password-vault migration uses an atomic write and leaves the original device-vault records untouched. Keep an encrypted backup before changing devices or browser profiles.
- The local API binds only to loopback. Do not expose it to an untrusted network.
