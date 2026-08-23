# ADR-0003: Photos — Google Drive API direct

**Status:** Accepted (2026-08-16)

## Context

Imported photo references and new uploads are stored through Google Drive. Drive is the canonical photo store; the app must fetch existing photos and store new uploads. The app does not depend on a local file store. Public Drive links are a privacy fail.

## Decision

Google Drive API v3, server-side only:

- **Credential**: OAuth desktop-app client with the `https://www.googleapis.com/auth/drive` scope. The refresh token lives in server-side environment configuration, never client-side. Access tokens (~1h) are refreshed via `oauth2Client` on each call.
- **Layout**: all app photos under `AeroDiary/photos/`; `photoPaths` map 1:1 to Drive-relative filenames with zero renaming.
- **Upload** (new photos): server action receives the file → `files.create` (multipart, `application/octet-stream`) → DB `Photo` row (`entryId`, `drivePath`, `mimeType`).
- **Serve**: `GET /photos/[id]` route handler streams `files.get({ fileId, alt: 'media' })` through the server with the token; response cached (immutable — photos never change) so Drive isn't hit per view.
- **Import**: the import workflow maps `photoPaths` → existing Drive paths.

## Consequences

- Zero extra local services and identical behavior across supported environments (pure HTTPS).
- Drive API quota (generous for personal use) is the only ceiling.
- Photos are private: browsers only ever talk to our server, never to Drive.
- A photo can only be deleted by deleting the DB row + Drive file together (delete path must do both).
