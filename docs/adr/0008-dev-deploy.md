# ADR-0008: Dev workflow & deployment — Mac-first, no Docker

**Status:** Accepted (2026-08-16)

## Context

Kenneth develops on his Mac (pnpm 11.17 / node 22.21.1); the app runs on his Oracle Cloud ARM box (tailnet-only via tailscale serve, systemd conventions from hermes-webui/api_server). SQLite is a single file — Docker solves multi-service version coupling this app doesn't have, and would add an ARM image, a volume, and a UFW-bypassing container to the security surface.

## Decision

- **Dev**: Mac-first. Clone from GitHub origin, `pnpm dev` against a local SQLite file, and run ChatMock locally for polish. `.env.local` carries the Drive refresh token + session secret + `LLM_BASE_URL=http://127.0.0.1:8000/v1`.
- **Origin**: GitHub `KennethLloyd/aero-diary` (public) — the single source of truth; the OCI copy at `/home/ubuntu/Projects/aero-diary` is the deploy checkout.
- **Deploy (OCI)**: `git pull` → `pnpm install` → `pnpm build` → systemd unit running the production server → tailscale serve (same pattern as hermes-webui). Own `.env` on OCI.
- **No Docker**, anywhere in the stack.
- **Backups**: the SQLite file is one file — extend the existing nightly `hermes-backup.timer` rclone flow to include it (post-v1 ticket, alongside the DB the Drive photos are already backed up by Drive itself).

## Consequences

- One command from repo to prod; the deploy path is boring and familiar.
- SQLite file must be treated as a backup citizen (ticket exists).
- Public repo means secrets live only in local `.env*` files (gitignored), never committed.
