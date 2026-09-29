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

See `.env.example` for LLM, journal-memory, and Google Drive configuration.

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

Journal memory uses local Ollama. See `.env.example` for model, batch size,
timeout, and keep-alive settings. Pull the default model with
`ollama pull embeddinggemma:300m-qat-q4_0`; run `pnpm memory:worker` to index
saves or `pnpm memory:backfill` to queue existing entries and reindex after a
model change.

For an existing SQLite installation, pause writes, back up the database, and
prepare an empty PostgreSQL+pgvector target with `pnpm db:setup`. Then import
with `pnpm db:import-sqlite -- --source <path-to-sqlite-file> --confirm-empty-target`.
The source stays unchanged; the importer validates records and queues indexing
jobs with the transfer. See the [migration guide](docs/sqlite-to-postgresql.md)
for rollback steps.
