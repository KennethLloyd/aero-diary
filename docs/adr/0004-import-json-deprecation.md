# ADR-0004: Journal import & JSON deprecation

**Status:** Accepted (2026-08-16)

## Context

Kenneth's journal lives in `Journal/entries_normalized.json` (2,777 entries, 2019-01-11 → 2026-08-15; Daylio export). Aero Diary's DB must become the journal's home and the JSON must eventually be deleted. Hermes' journal ecosystem (nightly journal-cache/map-mining cron, `/journal` skill, `journal_query.py`) currently consumes the JSON. Kenneth journals via `/journal` during development and will only switch to Aero Diary once it's ready to be his daily driver.

## Decision

- **Schema mirrors the JSON 1:1** so nothing is lost: `id` (Daylio id → `sourceId`, unique), `date` (ISO with local offset; store UTC + a `localOffset`/`localDate` for calendar grouping), `mood` (5-level enum, see CONTEXT.md mapping), `note`, `isFavorite`, plus join table `EntryActivity` and `Photo` rows.
- **Mood mapping at import**: LOL → Rad, "IDK WHAT TO DO" → Meh. Accepted data loss (Kenneth's explicit call: "LOL is Rad anyway and IDK is Meh").
- **Activities**: the import script owns the 25 legacy strings and resolves them into `Activity` rows with the curated emoji map, case-insensitively and idempotently. The Activities screen owns CRUD and archival after rows exist; it does not seed the legacy vocabulary.
- **Import script** (`scripts/import-journal.ts`, Prisma): idempotent via `sourceId` upsert; validates counts (2,777 entries) and reports a diff; runs on OCI at the switchover.
- **Timeline**: JSON remains the source of truth *during development* (Kenneth keeps using `/journal`). At the v1 switchover: run import → verify → repoint Hermes pipeline (journal-cache cron, journal_query, map mining) to the Aero Diary DB → delete the JSON.
- `isFavorite` stays in the schema (compat) with no UI in v1.

## Consequences

- The DB must expose whatever the Hermes journal pipeline needs (date/mood/note/tags) — a read path for the cron (direct SQLite read or small export) is part of the repoint ticket.
- Legacy activity creation and emoji mapping are part of the import switchover, not the entry-management feature.
- Until the switchover, new Daylio/`/journal` entries keep landing in the JSON — the import must be re-runnable so the final run picks them all up.
