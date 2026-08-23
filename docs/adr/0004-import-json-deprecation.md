# ADR-0004: Journal import & JSON lifecycle

**Status:** Accepted (2026-08-23)

## Context

An import file is an operator-supplied input to Aero Diary. The import workflow must accept any structurally valid template without requiring knowledge of its origin, private content, filenames, or fixed historical count.

## Decision

- **Input contract:** the importer consumes the structural `JournalImportTemplate` TypeScript/Zod schema. It requires `schema.moods`, `schema.tags`, `entries`, and each entry's `id`, `date`, `mood`, `note`, and `tags`; activity emojis inside `schema.tags` are optional, and compatibility fields `moodId`, `tagIds`, `isFavorite`, and `photoPaths` are optional with documented defaults.
- **Validation:** parse the entire source before writes, reject duplicate source IDs and invalid mappings, record a SHA-256 fingerprint, and reconcile the dynamic source count. Reruns are sourceId-keyed and never delete database rows absent from the current source.
- **Activities:** the import template owns the activity vocabulary and optional emoji definitions. The importer resolves those definitions for the selected user; the Activities screen does not seed import vocabulary.
- **Photos:** import `photoPaths` as Drive-relative metadata without reading photo bytes. A separate report-only Drive preflight resolves exact filenames; explicit apply stores `driveFileId`. Missing or duplicate filenames block apply.
- **Handoff:** import and validate first, complete photo preflight, verify the app, and point any optional external read tools to the database through private read-only SQLite configuration. Source-file archival or deletion remains a separate operator decision.

## Consequences

- Import source data remains outside the repository and is never needed by agents or development fixtures.
- The importer is reusable for any structurally valid input and remains safe as the journal grows.
- External read tools, if used, have a read-only database contract; new entries are created through Aero Diary.
- The application schema becomes the source of truth after a successful handoff, while an operator may retain the input file as a temporary recovery point.
