# ADR-0003: Photos — Google Drive API direct (OCI is not storage)

**Status:** Accepted (2026-08-16)

## Context

868 of 2,777 legacy journal entries carry photos (`photos/<hash>.jpg`), stored on Kenneth's Mac — not on OCI. Requirement: Drive is the canonical photo store; the app must fetch existing photos and store new uploads, working identically in Mac dev and OCI prod. rclone is rejected for the app itself (no rclone on the Mac; he won't install it for dev). Public Drive links are a privacy fail (private journal).

## Decision

Google Drive API v3, server-side only:

- **Credential**: OAuth desktop-app client (reuse the `rclone-backup` GCP project's client; one-time device flow to mint a refresh token with `https://www.googleapis.com/auth/drive` scope). Refresh token lives in the app `.env` (Mac + OCI), never client-side. Access tokens (~1h) refreshed via `oauth2Client` on each call.
- **Layout**: all app photos under `AeroDiary/photos/`; filenames keep the legacy `<hash>.jpg` so `photoPaths` map 1:1 with zero renaming.
- **Upload** (new photos): server action receives the file → `files.create` (multipart, `application/octet-stream`) → DB `Photo` row (`entryId`, `drivePath`, `mimeType`).
- **Serve**: `GET /photos/[id]` route handler streams `files.get({ fileId, alt: 'media' })` through the server with the token; response cached (immutable — photos never change) so Drive isn't hit per view.
- **Import**: the legacy `photos/` folder is uploaded to Drive once (Kenneth does this manually — drag into `AeroDiary/photos/` on Drive, or a one-off script); the import script then maps `photoPaths` → existing Drive paths.

## Consequences

- Zero extra services, zero rclone, identical behavior on Mac and OCI (pure HTTPS).
- Drive API quota (generous for personal use) is the only ceiling.
- Photos are private: browsers only ever talk to our server, never to Drive.
- A photo can only be deleted by deleting the DB row + Drive file together (delete path must do both).
