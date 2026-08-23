# ADR-0008: Dev workflow & deployment — standalone app, OCI profile

**Status:** Accepted (2026-08-23)

## Context

Aero Diary is a normal Next.js application and must remain deployable to any compatible web server or hosting platform. The chosen production environment is an Oracle Cloud ARM box with a private network posture, but that infrastructure preference must not become an application dependency.

## Decision

- **Portable application contract:** build with `pnpm build` and run with `pnpm start`. The app requires only its documented environment variables, Node/pnpm compatibility, database, and configured OpenAI-compatible LLM endpoint.
- **Dev:** Mac-first. Clone from GitHub origin, apply migrations, configure a disposable/local SQLite file, run `pnpm db:seed`, and use `pnpm dev`.
- **OCI profile:** the checkout is `/home/ubuntu/Projects/aero-diary`; deploy uses fast-forward Git pull, frozen dependency install, production migrations, build, and restart of an `aero-diary.service` systemd unit. The app listens on its configured local port and may be placed behind any reverse proxy.
- **Tailscale:** Tailscale serve is the chosen OCI exposure and access preference only. It is documented in the OCI operations profile and is not required by application code, dependencies, environment validation, generic deployment instructions, or tests.
- **ChatMock:** ChatMock is installed, authenticated, and managed by the OCI operator. Aero Diary only uses the OpenAI-compatible `LLM_BASE_URL` contract; no ChatMock package, service unit, installer, or runtime code belongs in this repository.
- **Backups:** the SQLite database is added to the existing OCI backup flow. The deployment runbook records the database path, backup verification, and application/database rollback procedure.

## Consequences

- A standard web server, reverse proxy, cloud host, or private network can run the standalone app without Tailscale.
- OCI operations are explicit and reproducible without coupling the product to OCI-specific binaries.
- Secrets, ChatMock setup, reverse-proxy setup, and backup credentials remain operator-managed.
