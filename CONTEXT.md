# CONTEXT.md — Aero Diary

A self-hosted mood journal ("your memories, vividly preserved") in the Frutiger Aero aesthetic — a Daylio alternative for a single real user plus a demo user. Next.js 16 + SQLite, deployed on Oracle Cloud (prod) and developed on macOS.

## Glossary

- **Entry** — one journal record: local date/time, mood, note text, activity tags, optional photos. `isFavorite` exists in the schema (Daylio compatibility) but has no UI in v1.
- **Mood** — the 5-level scale: **Awful, Bad, Meh, Good, Rad** (glossy orbs, red→cyan). The Daylio export has 7 moods; **LOL maps to Rad, "IDK WHAT TO DO" maps to Meh** at import time.
- **Activity** — a user-owned emoji + name tag (e.g. `💻 Work`, `🌲 Trail`), CRUD-manageable in the Activities screen, attachable to that user's entries. Demo and real users have independent activity vocabularies. Legacy Daylio activities and their curated emoji map are owned by the import workflow; the Activities screen does not seed them.
- **Photo** — an image attached to an entry. Canonical storage is **Google Drive** under `AeroDiary/photos/`; the DB row stores the Drive-relative path (`photos/<hash>.jpg`), mapping 1:1 to the legacy JSON's `photoPaths`. The OCI box is never the photo store.
- **Session** — an opaque auth token row (User + Session tables); the `httpOnly` cookie holds only the token. Instant revocation via row deletion.
- **Polish** — the synchronous LLM revision of an entry draft against the user's **style standard**, triggered by a "Polish ✨" button before save. Never required; never blocks saving.
- **Style standard** — optional per-user rules the polish uses; the real user's is seeded from Hermes' `style_summary` (the 11 journal-style rules), while users without one use the concise server-side default.
- **Demo user** — the seeded fictional user owning 90 days of seed entries and its own demo activity vocabulary, reachable via a "Try the demo" button on login. Never mixed with real entries or activities (user-scoped).
- **sourceId** — the legacy Daylio entry `id`, kept for idempotent JSON import (a sourceId already in the DB is skipped).
- **Aero design system** — the locked Frutiger Aero visual language from the prototype: sky-to-grass gradient, floating bubbles, glass panels, glossy split-highlight buttons, specular mood orbs, bottom dock. Implemented as design tokens + component classes; the vibe is non-negotiable.

## Standing constraints

- Latest stable packages only, verified live (see ADR-0001; re-verify at scaffold).
- Senior-level code: typed everything, Zod on every input, server-only data layer, security gates in every action.
- Journal data is the most private thing this app holds — no Google data-use, no client-visible secrets.
- Comments are concise and straightforward; max 1-2 lines only
