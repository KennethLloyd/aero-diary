# CONTEXT.md — Aero Diary

A self-hosted mood journal ("your memories, vividly preserved") in the Frutiger Aero aesthetic for private users plus a configured demo account. Next.js 16 + PostgreSQL and pgvector.

## Glossary

- **Entry** — one journal record: canonical `YYYY-MM-DD` journal date, mood, note text, activity tags, optional photos. `isFavorite` and `sourceId` are retained for existing database compatibility and have no UI.
- **Mood** — the 5-level scale: **Awful, Bad, Meh, Good, Rad** (glossy orbs, red→cyan).
- **Activity** — a user-owned emoji + name tag (e.g. `💻 Work`, `🌲 Trail`), CRUD-manageable in the Activities screen and attachable to that user's entries. Private and configured demo accounts have independent vocabularies.
- **Photo** — an image attached to an entry. Canonical storage is **Google Drive** under `AeroDiary/photos/`; the database stores the Drive-relative path and optional file ID.
- **Session** — an opaque auth token row (User + Session tables); the `httpOnly` cookie holds only the token. Instant revocation via row deletion.
- **Polish** — the synchronous LLM revision of an entry draft against the user's **style standard**, triggered by a "Polish ✨" button before save. Never required; never blocks saving.
- **Style standard** — optional per-user rules the polish uses; users without one use the concise server-side default.
- **Configured demo account** — an ordinary user selected by environment configuration and seeded with 90 days of fictional entries and its own activity vocabulary, reachable via a "Try the demo" button on login. Its data is never mixed with the private account's entries or activities.
- **Aero design system** — the locked Frutiger Aero visual language: sky-to-grass gradient, floating bubbles, glass panels, glossy split-highlight buttons, specular mood orbs, and a bottom dock. It is implemented through shared tokens and component classes.

## Standing constraints

- Keep package versions current and verify compatibility before upgrades.
- Senior-level code: typed everything, Zod on every input, server-only data layer, security gates in every action.
- Journal data is the most private thing this app holds — no Google data-use, no client-visible secrets.
- Comments are concise and straightforward; max 1-2 lines only.

## Storage and journal memory

- PostgreSQL is the application's runtime database. Archived SQLite migrations and the read-only importer exist only to transfer the old database.
- Journal note embeddings are derived data in pgvector. Saves enqueue work transactionally through pg-boss; the separate local-Ollama worker indexes current notes and excludes the configured demo account.
- Embedding retries are bounded. After pg-boss exhausts them, restore Ollama/database availability and run `pnpm memory:backfill` to requeue private entries.
- Tests require `TEST_DATABASE_URL` to point at a disposable, isolated PostgreSQL database. Test setup truncates its application tables; never point it at a live database.
