# OCI operating profile

This profile is optional infrastructure guidance for the OCI deployment. The application remains deployable through the portable contract in `ops/README.md`.

## Application

1. Copy `aero-diary.service.example` to the systemd unit directory and adjust the Node/pnpm executable path if needed.
2. Provision `/etc/aero-diary/aero-diary.env` with the application secrets and `DATABASE_URL="file:./data/aero-diary.db"`.
3. Run `deploy.sh` from an operator-authorized shell. It pulls the selected branch, installs the lockfile, applies production migrations, builds, restarts the app, and checks the local HTTP response.
4. Keep the app bound to its local listener. Any reverse proxy may expose it externally.

## ChatMock acceptance

ChatMock is installed, authenticated, and managed by the OCI operator outside this repository. Configure the service to provide the OpenAI-compatible endpoint expected by `LLM_BASE_URL`, then verify the polish flow from the deployed app. Aero Diary source code contains no ChatMock setup or dependency.

## Optional Tailscale exposure

Tailscale serve is the chosen OCI exposure preference, not an application dependency. It may forward the local app listener to the private tailnet, but another reverse proxy or hosting configuration is valid for other deployments.

## Backup and rollback

- Add the SQLite file at the configured application path to the existing nightly backup flow and verify a backup before any import or data handoff.
- Before migrations or import, record the current application commit and confirm a recoverable database backup.
- Roll back application code by deploying the previous known-good commit and restarting the service.
- Restore the SQLite file only when a migration or data operation requires database rollback; then re-run the health check.

## Optional data handoff

If an external read tool is used, the operator runs the import dry-run, applies the import, completes the photo preflight, verifies the app, and points that tool at the database through private read-only SQLite configuration. Any external input file may be archived or deleted only through a separate human-confirmed action.
