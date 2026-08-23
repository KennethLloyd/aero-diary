# Aero Diary

Aero Diary is a self-hosted mood journal for private memories. It uses a bright Frutiger Aero visual language: sky and grass gradients, glass panels, glossy controls, mood orbs, bubbles, and a bottom navigation dock.

## Features

- Private email/password authentication with database-backed sessions.
- Timeline browsing with cursor pagination, calendar, insights, and user-owned activities.
- Entry creation, editing, deletion, activity tags, and optional Google Drive photos.
- Best-effort entry polishing through any OpenAI-compatible chat-completions endpoint.
- An optional configured demo account with fictional, user-isolated data.

## Requirements

- Node.js 22 or newer.
- pnpm 11 or newer.
- SQLite and a Node-compatible deployment environment.

## Local setup

```bash
pnpm install --frozen-lockfile
cp .env.example .env.local
mkdir -p data
pnpm db:migrate
pnpm create-user you@example.com 'use-a-long-password'
pnpm dev
```

Open <http://localhost:3000>. The demo account is optional. To create it, set `DEMO_EMAIL` and `DEMO_PASSWORD` in `.env.local`, then run:

```bash
pnpm db:seed
```

`pnpm db:seed` only manages the configured demo user's fictional dataset. It does not replace or mix with another user's data.

## Environment configuration

All variables are read on the server. Keep secrets out of client code and source control.

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | SQLite URL, normally `file:./data/aero-diary.db`. |
| `DEMO_EMAIL` | No | Email for the optional configured demo account. |
| `DEMO_PASSWORD` | No | Password for the optional configured demo account. |
| `GOOGLE_DRIVE_CLIENT_ID` | No | Google OAuth desktop client ID for photo storage. |
| `GOOGLE_DRIVE_CLIENT_SECRET` | No | Google OAuth desktop client secret. |
| `GOOGLE_DRIVE_REFRESH_TOKEN` | No | Server-side refresh token for Drive access. |
| `GOOGLE_DRIVE_PHOTOS_ROOT` | No | Drive path for photos; defaults to `AeroDiary/photos`. |
| `LLM_BASE_URL` | No | OpenAI-compatible API base URL for polishing. |
| `LLM_MODEL` | No | Model name sent to the configured endpoint. |
| `LLM_REASONING_EFFORT` | No | Reasoning setting sent to the endpoint. |
| `LLM_MAX_TOKENS` | No | Maximum polish response tokens. |
| `LLM_TIMEOUT_MS` | No | Timeout for a polish request. |

Copy `.env.example` and replace only the blank values you need. Never commit real environment files, database files, Drive tokens, or private journal content; `.env.example` is the safe template.

## Google Drive photos

Photo support is optional. Create a Google OAuth desktop client with Drive access, put the client ID and secret in the server environment, then run `pnpm drive:bootstrap` locally to complete the consent flow. Store the resulting refresh token only in the server environment. Browsers communicate with Aero Diary's authenticated photo route and never receive Drive credentials or public Drive links.

## Entry polishing

Set the LLM variables to an OpenAI-compatible gateway. The Polish action sends the draft to that configured server-side endpoint and returns a suggestion for approval. Saving an entry never depends on a successful polish request.

## Development commands

```bash
pnpm dev
pnpm test
pnpm typecheck
pnpm lint
pnpm build
pnpm test:e2e
pnpm db:migrate
pnpm db:seed
pnpm create-user <email> <password>
```

The Playwright smoke suite needs `PLAYWRIGHT_BASE_URL`, `PLAYWRIGHT_DEMO_EMAIL`, and `PLAYWRIGHT_DEMO_PASSWORD`. It does not contain journal credentials or private entries.

## Production notes

Run the production build with `pnpm build` and serve it with `pnpm start` behind the reverse proxy or private network setup appropriate for your deployment. Use HTTPS, restrict access to trusted users, provide a persistent SQLite volume, and back up that volume securely. Deployment networking and remote access choices are environment-specific.

## Privacy and security

Journal entries, activity vocabularies, photos, session tokens, style standards, and provider credentials are private data. Every protected read and mutation authenticates the caller, and user-scoped cached reads use the authenticated user ID as a cache key and tag namespace. Do not commit real `.env` files, SQLite databases, journal exports, Drive inventories or tokens, private style files, or machine-specific deployment configuration.
