# ADR-0001: Stack & versions

**Status:** Accepted (2026-08-16)

## Context

Use the latest stable packages, verified against the web — never assume a version is current. Verified live on 2026-08-16 via npm registry API + official docs (full citations in `vault/aero-diary-stack-verification-2026-08-16.md`).

## Decision

| Package | Version | Notes |
|---|---|---|
| next | 16.3.1 | latest major confirmed |
| react / react-dom | 19.2.8 | latest |
| typescript | **^6** | TS 7.0.2 is npm `latest` but is the Go-native port with **no JS Compiler API** — Next 16 cannot consume it (`next build` fails). Upgrade to TS 7.1 only when the Next.js team recommends it. |
| zod | 4.4.3 | latest |
| prisma / @prisma/client | 7.9.1 | adapter-based architecture |
| tailwindcss | 4.3.3 | latest |
| vitest | latest | unit tests (ADR-0007) |
| jose | 6.2.9 | session cookie signing (ADR-0002) |
| pnpm | 11.17 | server-side tooling version |

Known Prisma 7 + Next 16 Turbopack gotchas (from live sources): the new `prisma-client` generator can break SSR module resolution; `new PrismaClient()` requires an adapter; datasource URLs move to `prisma.config.ts`. **Spike at scaffold time** to verify the generator + adapter combo on 7.9.1 before committing the pattern.

## Consequences

- SQLite native (better-sqlite3 adapter) — no Docker (ADR-0008).
- A scaffold spike ticket exists to settle the Prisma generator choice empirically.
- TS stays at ^6 until TS 7.1 ships the programmatic API and Next blesses it.
