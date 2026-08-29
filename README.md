# Aero Diary

Aero Diary is a self-hosted mood journal for private memories. It uses a bright Frutiger Aero visual language: sky-to-grass gradients, glass panels, glossy controls, mood orbs, bubbles, and a bottom navigation dock.

## Features

- Private email/password authentication with database-backed, revocable sessions.
- Journal entries with a canonical date, mood, notes, activity tags, and optional photos.
- Timeline browsing with cursor pagination, calendar views, insights, and favorites.
- User-owned activities that can be created, edited, attached to entries, and archived independently.
- Five-level mood scale: **Awful**, **Bad**, **Meh**, **Good**, and **Rad**.
- Optional Google Drive photo storage through an authenticated server-side route.
- Best-effort entry polishing through any OpenAI-compatible chat-completions endpoint.
- An optional configured demo account with fictional, user-isolated data.

## Requirements

- Node.js 22.23.1 or newer.
- pnpm 11.17.0.
- SQLite.
- A Node-compatible runtime for deployment.

## Local setup

Run the following from the repository root:

```bash
pnpm install --frozen-lockfile
cp .env.example .env.local
mkdir -p data
pnpm db:migrate
pnpm create-user you@example.com 'use-a-long-password'
pnpm dev
```

`DATABASE_URL` in `.env.local` normally uses `file:./data/aero-diary.db`. Open <http://localhost:3000> and sign in with the account created above. Local setup is complete when the application loads and that account can authenticate.

### Optional demo account

Set `DEMO_EMAIL` and `DEMO_PASSWORD` in `.env.local`, then run:

```bash
pnpm db:seed
```

The seed command manages only the configured demo user's fictional dataset. It creates or refreshes that ordinary user, its entries, activities, and photo metadata without mixing them with another user's data. The login screen exposes the account through the **Try the demo** action.

## Environment configuration

`.env.example` is the configuration template and the authoritative list of supported variables. Copy it to `.env.local` for local development or to `.env` for Compose. All variables are read server-side; secrets never use `NEXT_PUBLIC_*` variables.

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | SQLite URL. Use `file:./data/aero-diary.db` locally and `file:/app/data/aero-diary.db` in the container. |
| `DEMO_EMAIL` | No | Email for the optional configured demo account. |
| `DEMO_PASSWORD` | No | Password for the optional configured demo account. |
| `GOOGLE_DRIVE_CLIENT_ID` | No | Google OAuth desktop client ID for photo storage. |
| `GOOGLE_DRIVE_CLIENT_SECRET` | No | Google OAuth desktop client secret. |
| `GOOGLE_DRIVE_REFRESH_TOKEN` | No | Server-side refresh token for Drive access. |
| `GOOGLE_DRIVE_PHOTOS_ROOT` | No | Drive path for photos. Defaults to `AeroDiary/photos`. |
| `LLM_BASE_URL` | No | OpenAI-compatible API base URL for entry polishing. |
| `LLM_MODEL` | No | Model name sent to the configured endpoint. |
| `LLM_REASONING_EFFORT` | No | Reasoning setting sent to the endpoint. |
| `LLM_MAX_TOKENS` | No | Maximum polish response tokens. |
| `LLM_TIMEOUT_MS` | No | Timeout for a polish request. |

Keep secrets in the server environment and use the blank values in `.env.example` only as configuration points. Keep real environment files, database files, Drive tokens, and private journal content out of source control.

## Optional integrations

### Google Drive photos

Photo storage is optional. Create a Google OAuth desktop client with Drive access, set the client ID and secret in the server environment, then run:

```bash
pnpm drive:bootstrap
```

The bootstrap command completes the local consent flow and produces a refresh token. Store that token only in the server environment. The database stores a Drive-relative path and optional file ID. Browsers use Aero Diary's authenticated photo route and never receive Drive credentials or public Drive links.

### Entry polishing

Set the `LLM_*` variables to an OpenAI-compatible gateway. The **Polish ✨** action sends the draft and the user's optional style standard to that server-side endpoint and returns a suggestion for approval. Users without a style standard use the concise server-side default. Saving an entry remains independent of the polish request.

## Development

`package.json` is the source of truth for available scripts. The normal verification loop is:

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

The Playwright smoke suite requires a running application and these variables:

- `PLAYWRIGHT_BASE_URL`
- `PLAYWRIGHT_DEMO_EMAIL`
- `PLAYWRIGHT_DEMO_PASSWORD`

Run it with:

```bash
pnpm test:e2e
```

Use a dedicated demo account and seeded database for E2E testing. Set `PLAYWRIGHT_POLISH_DISABLED=1` when no LLM endpoint is available. Verification is complete when the relevant checks pass for the changed behavior.

Useful data and integration commands:

```bash
pnpm db:generate
pnpm db:migrate
pnpm db:migrate:deploy
pnpm db:studio
pnpm db:seed
pnpm create-user <email> <password>
pnpm drive:bootstrap
```

Use `pnpm db:migrate` for local schema development and `pnpm db:migrate:deploy` for an already-reviewed migration in a deployment environment.

## Production

Build and serve the application with:

```bash
pnpm build
pnpm start
```

Run it behind the reverse proxy or private-network setup appropriate for the environment. Use HTTPS, restrict access to trusted users, provide persistent SQLite storage, and back up that storage securely.

Aero Diary exposes `GET /api/health`. It returns a healthy response only when SQLite is usable and returns HTTP 503 otherwise.

## Production container

The repository includes a reproducible, multi-stage Docker build with separate `runtime` and `migrate` targets. It uses a digest-pinned Node 22.23.1 Debian slim base, Next.js standalone output, and a non-root serving process. The serving image is built separately from the migration target so schema changes remain explicit.

The image contains neither runtime secrets nor SQLite data. Docker context exclusions protect environment files, local databases, generated files, dependencies, build output, and test artifacts. Pass configuration at runtime and keep `data/` outside the image.

### Local Compose

Copy the environment template and create the persistent database directory:

```bash
cp .env.example .env
mkdir -p data
```

Compose uses `file:/app/data/aero-diary.db` inside the container, mounts `./data` at `/app/data`, and binds the app to `127.0.0.1:3000` by default. If the host account is not UID/GID `1000`, export the values before building or starting:

```bash
export AERO_DIARY_UID="$(id -u)"
export AERO_DIARY_GID="$(id -g)"
```

Run the migration target before starting the serving image:

```bash
docker compose --profile migrate build migrate
docker compose --profile migrate run --rm migrate
docker compose up --build app
```

The app image starts only the Next.js standalone server. It does not seed data or run migrations automatically. Back up an existing SQLite database before applying migrations.

To build and run the serving image directly:

```bash
docker build --target runtime --tag aero-diary:local .
docker run --rm \
  --env-file .env \
  --env DATABASE_URL=file:/app/data/aero-diary.db \
  --env NODE_ENV=production \
  --publish 127.0.0.1:3000:3000 \
  --user "$(id -u):$(id -g)" \
  --volume "$PWD/data:/app/data" \
  aero-diary:local
```

### GHCR images

Successful pushes to `main` publish the serving image to `ghcr.io/<owner>/aero-diary` with `latest` and a full commit-SHA tag. A matching migration image uses the same package and the `<commit-sha>-migrate` tag. Both images publish `linux/amd64` and `linux/arm64` variants.

For a reproducible pull, use the commit tag to locate the image and deploy the resolved digest rather than `latest`:

```bash
docker pull ghcr.io/<owner>/aero-diary:<commit-sha>
docker image inspect ghcr.io/<owner>/aero-diary:<commit-sha> \
  --format '{{index .RepoDigests 0}}'
```

Pull and run the migration image separately when applying a reviewed schema change. Compose can use published artifacts instead of local builds by setting `AERO_DIARY_IMAGE` and `AERO_DIARY_MIGRATION_IMAGE` to matching GHCR tag or digest references and using `--no-build`.

Pull request CI builds both Docker targets without pushing images. Main-branch publication builds and pushes the published image variants.

## Privacy and security

Journal entries, activity vocabularies, photos, session tokens, style standards, and provider credentials are private data. Every protected read and mutation authenticates the caller. User-scoped cached reads use the authenticated user ID as their cache key and tag namespace.

The `httpOnly` session cookie contains only an opaque token; the session row provides immediate revocation when deleted. Drive credentials remain server-side, and the configured demo account has independent entries and activities.

Keep real `.env` files, SQLite databases, journal exports, Drive inventories or tokens, private style files, and machine-specific deployment configuration out of source control.

## Design token boundary

Shared control dimensions, focus rings, dock geometry, surface opacity, typography tiers, and reduced-motion behavior live in `src/app/globals.css`.

Mood-specific gradients, photo-viewer surfaces, and one-off page compositions intentionally keep local values because they encode the semantic visual treatment of those components rather than reusable system tokens.

## Repository guidance

- Read `CONTEXT.md` before changing domain behavior, authentication, data ownership, photos, entry polishing, or the Aero design system. It defines the repository's vocabulary and invariants.
- Read `AGENTS.md` before issue or pull-request work. It defines the branch, review, architecture, and verification workflow.
- Use `package.json`, `.env.example`, `Dockerfile`, `compose.yaml`, and `.github/workflows/` as the sources of truth for scripts, configuration, container behavior, and CI.
