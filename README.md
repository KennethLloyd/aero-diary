# Aero Diary

Aero Diary is a private mood journal with a bright **Frutiger Aero** visual style.

Write about your day naturally, and Aero Diary can use an LLM to automatically infer and attach relevant activities from your journal entry.

![Aero Diary showcase](docs/images/aero-diary-showcase.png)

## Highlights

- ✨ **Automatic activity inference** — an LLM analyzes journal entries and attaches matching activities automatically.
- 📝 **Mood journaling** — record notes, moods, activities, favorites, and photos.
- 📅 **Timeline & calendar** — browse memories chronologically or by date.
- 📊 **Insights** — explore patterns across moods and activities.
- 🪄 **AI-assisted polishing** — optionally improve journal entries through an OpenAI-compatible LLM.
- 📷 **Photo support** — attach photos to journal entries.
- 🔐 **Private by design** — journal data is protected behind authentication, with an optional PIN app lock for shared devices.
- 🌤️ **Frutiger Aero UI** — glass panels, gradients, glossy controls, bubbles, and mood-driven visuals.

## Tech Stack

**Next.js 16 · React 19 · TypeScript · Prisma · PostgreSQL · pgvector · Tailwind CSS · Vitest · Playwright**

LLM features support OpenAI-compatible APIs.

## Local Development

Requires Node.js 22+ and pnpm.
```bash
cp .env.example .env.local
docker compose up -d
pnpm install
pnpm db:setup
pnpm create-user you@example.com your-password
pnpm dev
```

Then open `http://localhost:3000`.

See `.env.example` for optional LLM and Google Drive configuration.

## Tests

Tests use `TEST_DATABASE_URL` and clear application tables between tests. Point
it at a disposable PostgreSQL database, never a personal or production database.
For the local Docker database, create and prepare one with:

```bash
docker compose exec postgres createdb -U aero aero_diary_test
DATABASE_URL=postgresql://aero:aero-local-only@127.0.0.1:5432/aero_diary_test pnpm db:setup
```

Then run the suite with both variables aimed at that test database:

```bash
DATABASE_URL=postgresql://aero:aero-local-only@127.0.0.1:5432/aero_diary_test \
TEST_DATABASE_URL=postgresql://aero:aero-local-only@127.0.0.1:5432/aero_diary_test \
pnpm test
```

GitHub Actions provisions and migrates its own disposable PostgreSQL database.

Journal memory uses a separate `pnpm memory:worker` process and local Ollama.
Install Ollama, then pull the model with `ollama pull embeddinggemma:300m-qat-q4_0`.
Start the worker after `pnpm db:setup`; `pnpm memory:backfill` queues existing
private entries. Journal saves remain available while Ollama or the worker is
offline because embedding work stays in PostgreSQL through pg-boss.

For an existing SQLite installation, rehearse the transfer against a fresh,
isolated PostgreSQL database with
`pnpm db:import-sqlite -- --source <path-to-sqlite-file> --confirm-empty-target`.
The source is opened read-only, the target must be empty, and the transfer
writes the records and indexing jobs in one transaction. See
[`docs/sqlite-to-postgresql.md`](docs/sqlite-to-postgresql.md) for validation
and rollback steps. Do not rehearse against a live production target.
