# ADR-0002: Authentication — fully manual, DB-backed sessions

**Status:** Accepted (2026-08-16)

## Context

The project rejected Better Auth (black box: it owns the schema, the Prisma models, the flow). Auth.js v5 never shipped stable (absorbed into Better Auth); Lucia is archived. The Next.js docs still document manual session management (jose / iron-session) as a sanctioned path, and the "use a library" guidance targets multi-user products with OAuth/2FA/password-resets. Aero Diary has one private account and one optional configured demo account, email+password only. The OCI profile prefers private network exposure, but the standalone app remains deployable behind any normal web server or reverse proxy.

## Decision

Manual auth, every line owned:

- **Schema**: `User` (id, email unique, passwordHash, name, styleStandard, timestamps) + `Session` (id, userId FK, tokenHash, expiresAt, createdAt) — two small tables, no special user type.
- **Password hashing**: argon2id (e.g. `@node-rs/argon2`), per-user salt, hash verification only — never roll our own crypto.
- **Sessions**: opaque 32-byte random token; store only its SHA-256 hash in `Session`; cookie holds the raw token with `httpOnly`, `secure`, `SameSite=Lax`; ~30-day expiry, sliding renewal; logout/delete = row removal = instant revoke.
- **Gate**: one `verifySession()` DAL (`lib/dal.ts`, server-only) called at the top of **every** protected server action and data read — the Lesson-3 pattern, productionized.
- **Inputs**: Zod schemas on login/register/change-password; generic error messages (no user enumeration); login rate-limiting (in-memory per-IP + per-email throttle, exponential backoff).
- **Server-only rule**: `import 'server-only'` everywhere secrets live; no client component ever sees the token, user hash, or Drive credentials.
- **Configured demo**: `DEMO_EMAIL` and `DEMO_PASSWORD` are server-side configuration only. The login screen receives only whether the demo is configured; the action verifies those credentials through the normal credential verifier and creates the same session type as a regular login.
- Cookie signing with jose is optional (opaque token needs no signing — the DB row is the authority); jose remains for CSRF-safe same-site cookies if needed.

## Consequences

- Full transparency: maintainers can read and reason about every auth path.
- Security burden is ours — mitigated by a tiny account surface, no OAuth, server-only secrets, and a deployment profile that can restrict OCI exposure to a private network.
- Password reset is a deliberate non-feature in v1 (single real user; reset = edit row via `pnpm` script).
- Demo login ("Try the demo") creates a Session for the configured ordinary user — same credential and session path, no special casing.
