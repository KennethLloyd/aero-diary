# Data Model — Legacy Journal Contract & Aero Diary Schema

## Purpose & hard rule

This document is the **single source of truth for the data model**. The legacy journal file (`entries_normalized.json`, on the OCI box only) contains Kenneth's private entries and:

- **must never leave the OCI box** (never downloaded to a dev machine, never copied into this repo);
- **must never be read by any agent** — local or remote — while implementing schema, import, or UI work.

All schema and import work derives from the structural contract below. No agent needs the data; the shape is fully specified here.

## Legacy JSON contract (structural only)

Location: `Journal/entries_normalized.json` on OCI. 2,777 entries, 2019-01-11 → 2026-08-15 (Daylio export, normalized).

Top-level shape: `{ "schema": ..., "entries": [Entry, ...] }`.

### Entry fields

| Field | Type | Notes |
|---|---|---|
| `id` | int | Daylio id → stored as `sourceId`; the idempotency key for import |
| `date` | string | ISO 8601 with local offset, e.g. `2019-01-11T19:22:00+08:00` |
| `mood` | string | One of 7 Daylio moods (see mapping below) |
| `moodId` | int | Daylio mood id — not carried forward; mood is stored by the 5-level enum |
| `note` | string | Free-text journal content (private — never echoed into code, tests, or docs) |
| `tags` | string[] | Activity names, 25 distinct legacy values (list below) |
| `tagIds` | int[] | Daylio tag ids — not carried forward |
| `isFavorite` | boolean | Preserved in the schema; no UI in v1 |
| `photoPaths` | string[] | Relative paths of the form `photos/<md5>.jpg`; mapped 1:1 to Google Drive paths under `AeroDiary/photos/` |

### Mood mapping (7 → 5)

| Legacy (Daylio) | Aero Diary enum |
|---|---|
| Rad | `RAD` |
| Good | `GOOD` |
| LOL | `RAD` |
| Meh | `MEH` |
| IDK WHAT TO DO | `MEH` |
| Bad | `BAD` |
| Awful | `AWFUL` |

### Legacy activity vocabulary (25)

```
watching, work, gaming, exercise, relax, family, chat, heart, research,
good meal, travel, reading, character development, social, sideline,
cooking, date, drawing, driving, focus, karaoke, korean, party, Piano, shopping
```

These are import inputs. Ticket #9 resolves them into `Activity` rows with the curated emoji map; the Activities screen does not own this mapping or seed them at runtime. Note the exact string `Piano` (capital P) — normalization/emoji mapping must handle case differences.

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
  isDemo        Boolean   @default(false)
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
  sourceId    Int?      @unique // legacy Daylio id; null for new app-created entries
  userId      String
  user        User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  date        DateTime  // stored UTC; local offset handled at the boundary
  localOffset Int       // minutes east of UTC, from the legacy ISO offset
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
  drivePath   String // e.g. "photos/<md5>.jpg" — relative to the AeroDiary Drive folder
  driveFileId String? // Drive file id for unambiguous new-upload reads/deletes
  mimeType    String
  createdAt   DateTime @default(now())
}
```

Notes:
- `sourceId` unique + nullable → idempotent import (upsert skips existing sourceIds).
- `Session.tokenHash` stores only the hash — a DB leak never exposes live tokens (ADR-0002).
- `isArchived` hides an activity from new entries while preserving its historical `EntryActivity` links.
- `Activity` rows are user-owned; all activity reads, mutations, and entry attachments must use the authenticated user's id. Demo and imported real-user activities are separate rows.
- `@@unique([userId, name, emoji])` prevents per-user tag duplicates; ticket #9's legacy import must dedupe by lowercase name within the imported user.
- Schema evolution follows ADR-0004; `isFavorite` intentionally has no UI in v1.

## Import contract (ticket #9)

- Runs on OCI at the switchover (the JSON lives there); implemented against this doc — never by reading the file during development.
- Idempotent via `sourceId`; validates total count (2,777) and reports a diff.
- Resolves the 25 legacy activity names and curated emoji map into `Activity` rows for the imported real user; this is the only owner of legacy activity creation for imported data.
- The demo seed in ticket #8 creates its own demo-user activity rows; it never creates global/shared activities.
- Photo mapping: `photoPaths` entries resolve to Drive paths under `AeroDiary/photos/` (ADR-0003); missing files are reported, not fatal.
