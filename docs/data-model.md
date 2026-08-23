# Data Model — Journal Import Contract & Aero Diary Schema

## Purpose & hard rule

This document is the **single source of truth for the data model**. An import file may be supplied at runtime and:

- **must never be copied into this repo**;
- **must never be read by any agent** — local or remote — while implementing schema, import, or UI work.

All schema and import work derives from the structural contract below. No agent needs the data; the shape is fully specified here.

## Journal import template (structural only)

The current importer accepts a JSON file. It is never copied into this repository or read by agents.

Top-level shape: `{ "schema": ..., "entries": [Entry, ...] }`. The import-specific `JournalImportTemplate` requires `schema.moods` and `schema.tags` definitions so the input owns its mood targets and activity emojis.

The template metadata has this structural shape:

```json
{
  "schema": {
    "moods": [{ "name": "<source mood>", "target": "<Aero Diary mood>" }],
    "tags": [{ "name": "<activity name>", "emoji": "<optional activity emoji>" }]
  },
  "entries": []
}
```

### Entry fields

| Field | Type | Notes |
|---|---|---|
| `id` | int, required | Template entry id → stored as `sourceId`; the idempotency key for import |
| `date` | string, required | ISO 8601 with local offset |
| `mood` | string, required | A source mood name resolved through `schema.moods` |
| `moodId` | int, optional | Optional source mood id; accepted for compatibility and not carried forward |
| `note` | string, required | Free-text journal content; never echoed into code, tests, or docs |
| `tags` | string[], required | Activity names, resolved through `schema.tags` |
| `tagIds` | int[], optional | Optional source activity ids; accepted for compatibility and not carried forward |
| `isFavorite` | boolean, optional | Defaults to `false`; preserved in the database with no v1 UI |
| `photoPaths` | string[], optional | Defaults to `[]`; mapped to Drive-relative paths under `AeroDiary/photos/` |

The input template is the master list for activity names and optional emojis. An explicit emoji is preserved. When it is omitted, the importer resolves the name through the bundled emoji name index and uses `✨` only when no match is available. The importer does not contain an application-side activity map.

## Aero Diary schema (Prisma)

SQLite via Prisma 7 (driver-adapter architecture, ADR-0001). Enum + models:

```prisma
enum Mood {
  AWFUL
  BAD
  MEH
  GOOD
  RAD
}

model User {
  id            String    @id @default(cuid())
  email         String    @unique
  passwordHash  String
  name          String?
  styleStandard String?   // optional per-user polish rules; blank uses the concise default
  sessions      Session[]
  entries       Entry[]
  activities    Activity[]
  createdAt     DateTime  @default(now())
}

model Session {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  tokenHash String   @unique // SHA-256 of the opaque session token
  expiresAt DateTime
  createdAt DateTime @default(now())
}

model Entry {
  id          String    @id @default(cuid())
  sourceId    Int?      @unique // import template id; null for new app-created entries
  userId      String
  user        User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  date        DateTime  // stored UTC; local offset handled at the boundary
  localOffset Int       // minutes east of UTC, from the import ISO offset
  mood        Mood
  note        String
  isFavorite  Boolean   @default(false)
  activities  EntryActivity[]
  photos      Photo[]
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
}

model Activity {
  id         String          @id @default(cuid())
  userId     String
  user       User            @relation(fields: [userId], references: [id], onDelete: Cascade)
  name       String
  emoji      String          @default("✨")
  isArchived Boolean         @default(false)
  entries    EntryActivity[]
  sortOrder  Int             @default(0)
  @@unique([userId, name, emoji])
}

model EntryActivity {
  entryId    String
  activityId String
  entry      Entry    @relation(fields: [entryId], references: [id], onDelete: Cascade)
  activity   Activity @relation(fields: [activityId], references: [id], onDelete: Restrict)
  @@id([entryId, activityId])
}

model Photo {
  id          String @id @default(cuid())
  entryId     String
  entry       Entry  @relation(fields: [entryId], references: [id], onDelete: Cascade)
  drivePath   String // e.g. "photos/<filename>" — relative to the AeroDiary Drive folder
  driveFileId String? // Drive file id for unambiguous new-upload reads/deletes
  mimeType    String
  createdAt   DateTime @default(now())
}
```

Notes:
- `sourceId` unique + nullable → idempotent import (upsert safely updates existing sourceIds).
- `Session.tokenHash` stores only the hash — a DB leak never exposes live tokens (ADR-0002).
- `isArchived` hides an activity from new entries while preserving its historical `EntryActivity` links.
- `Activity` rows are user-owned; all activity reads, mutations, and entry attachments must use the authenticated user's id. Configured-demo and imported activities are separate rows.
- `@@unique([userId, name, emoji])` prevents per-user tag duplicates; ticket #9's import must dedupe by lowercase name within the selected user.
- Schema evolution follows ADR-0004; `isFavorite` intentionally has no UI in v1.

## Import contract (ticket #9)

- The importer receives a configured database and input file; implemented against this doc — never by reading a real input file during development.
- Idempotent via `sourceId`; validates the complete parsed source, records its SHA-256 fingerprint, reconciles the dynamic source count, and reports a diff without deleting rows absent from the source.
- Resolves the activity definitions supplied by `schema.tags` into `Activity` rows for the selected user; this is the only owner of import-time activity creation.
- The demo seed creates its own configured-demo activity rows; it never creates global/shared activities.
- Photo mapping: `photoPaths` entries create Drive-relative `Photo` rows without requiring photo bytes. A separate report-only preflight resolves exact filenames under `AeroDiary/photos/`, stores `driveFileId` only in explicit apply mode, and blocks apply on missing or duplicate files.
- The importer consumes the structural `JournalImportTemplate` interface and Zod schema. It never depends on a particular input origin, note, filename, or fixed entry count.
