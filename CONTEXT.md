# CONTEXT.md — Aero Diary

A self-hosted mood journal ("your memories, vividly preserved") in the Frutiger Aero aesthetic for private users plus a configured demo account. Next.js 16 + SQLite, deployable to any compatible web server.

## Glossary

- **Entry** — one journal record: local date/time, mood, note text, activity tags, optional photos. `isFavorite` is an optional import-compatible field and has no UI in v1.
- **Mood** — the 5-level scale: **Awful, Bad, Meh, Good, Rad** (glossy orbs, red→cyan). Import files provide their own source-mood-to-Aero-Diary targets through the template schema.
- **Activity** — a user-owned emoji + name tag (e.g. `💻 Work`, `🌲 Trail`), CRUD-manageable in the Activities screen, attachable to that user's entries. The private and configured demo accounts have independent activity vocabularies. Import activity names and emojis come from the import template; the application does not hardcode that source vocabulary.
- **Photo** — an image attached to an entry. Canonical storage is **Google Drive** under `AeroDiary/photos/`; the DB row stores the Drive-relative path (`photos/<filename>`), mapping 1:1 to an import file's `photoPaths`.
- **Journal import template** — the structural, Zod-validated input contract for journal imports: required entry identity/date/mood/note/activity fields plus optional compatibility metadata and photo paths. It describes a class of valid inputs, not one particular export.
- **Photo preflight** — the separate operator-approved step that resolves imported photo filenames in Drive, reports missing or duplicate matches, and persists exact Drive file IDs only after a clean resolution pass.
- **Data handoff** — an optional operator-controlled transition from another journal workflow to the Aero Diary database: verify the app and import, configure any external read tools, and retain source backups according to the operator's policy.
- **Session** — an opaque auth token row (User + Session tables); the `httpOnly` cookie holds only the token. Instant revocation via row deletion.
- **Polish** — the synchronous LLM revision of an entry draft against the user's **style standard**, triggered by a "Polish ✨" button before save. Never required; never blocks saving.
- **Style standard** — optional per-user rules the polish uses; users without one use the concise server-side default.
- **Configured demo account** — an ordinary user selected by deployment configuration and seeded with 90 days of fictional entries and its own activity vocabulary, reachable via a "Try the demo" button on login. Its data is never mixed with the private account's entries or activities.
- **sourceId** — the import template entry `id`, kept for idempotent imports (a sourceId already in the DB is updated safely).
- **Aero design system** — the locked Frutiger Aero visual language from the prototype: sky-to-grass gradient, floating bubbles, glass panels, glossy split-highlight buttons, specular mood orbs, bottom dock. Implemented as design tokens + component classes; the vibe is non-negotiable.

## Standing constraints

- Latest stable packages only, verified live (see ADR-0001; re-verify at scaffold).
- Senior-level code: typed everything, Zod on every input, server-only data layer, security gates in every action.
- Journal data is the most private thing this app holds — no Google data-use, no client-visible secrets.
- Comments are concise and straightforward; max 1-2 lines only
