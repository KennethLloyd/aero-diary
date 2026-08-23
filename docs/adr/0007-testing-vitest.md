# ADR-0007: Testing — Vitest units in v1, Playwright after

**Status:** Accepted (2026-08-23)

## Context

"Senior-level code" requires tests around the parts that can hurt: auth, validation, the import, the Drive service. Next.js 16 docs (v16.3.1) document both Jest and Vitest; every current Vercel-authored guide and the community standard for greenfield apps is **Vitest** (native TS/ESM, Jest-compatible API, ~4x faster). Known boundary: Vitest cannot render async Server Components — that layer belongs to E2E.

## Decision

- **Vitest + React Testing Library**, unit tests on:
  - **Server actions as plain functions** (mock `next/headers`/`cookies` + session helper) — the four-branch matrix per protected action: **anonymous / invalid input / wrong owner / valid**. This is the highest-ROI testing in the app (auth + validation live in actions).
  - lib/ logic: mood mapping (7→5), import idempotency (`sourceId` upsert, counts), Drive service (mocked HTTP), session DAL, argon2 verify.
  - Zod schemas.
- **No component/DOM tests for async server components** in v1 (they throw by design in Vitest).
- **Playwright E2E** covers the production smoke (login → create → detail → polish → cleanup) against an operator-supplied `PLAYWRIGHT_BASE_URL`. Credentials are supplied through environment variables; fixtures contain no private journal content.

## Consequences

- Fast pre-commit gate on the risky logic; the auth matrix catches the bugs that actually reach production (IDOR-shaped ones).
- E2E scope deferred keeps v1 lean; the async-RSC boundary is respected instead of fought.
