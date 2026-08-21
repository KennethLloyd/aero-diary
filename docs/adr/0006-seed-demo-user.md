# ADR-0006: Seed data & configured demo account

**Status:** Accepted (2026-08-16)

## Context

Kenneth demos Aero Diary without logging into his private account and without exposing his real entries. The demo must look alive: calendar with mood dots, insights with distributions, timeline with variety. A demo account must not be a special database user type because it exercises the same auth and data paths as any other account.

## Decision

- `pnpm db:seed` is the canonical first-time and repeat setup command. It reads server-only `DEMO_EMAIL` and `DEMO_PASSWORD`, provisions or updates that ordinary user, and creates:
  - A configured demo account reachable through the one-tap **"Try the demo"** button on the login screen — no typing and no client-visible credentials.
  - **90 days of fictional entries** ending "today", covering all 5 moods (weighted like a real life: mostly Good/Rad, some Meh, rare Bad/Awful), ~8 demo-owned activities, a handful of stock photos (not Kenneth's).
  - Fictional-but-plausible content (no real people, places, or events from Kenneth's life).
- Demo data is fully `userId`-scoped — the private account and configured demo account can never see each other's entries.
- Demo activity rows are also fully `userId`-scoped — they are visible only to the configured demo account and are never shared with or reused by the private account's vocabulary.
- The seed is deterministic and re-runnable. It resets only the known configured demo dataset and refuses to overwrite an existing account that does not match that dataset, including when `DEMO_EMAIL` changes.
- The seed keeps photo rows user-scoped. The three stock-photo metadata paths are `photos/demo-forest.jpg`, `photos/demo-coffee.jpg`, and `photos/demo-sky.jpg` under the configured Drive photos root.

## Consequences

- Demo is one click away, with zero risk of leaking private entries.
- Insights/calendar/stats look believable in a demo without 7 years of data.
- The configured demo account exercises the same code paths as the private account (auth, entries, photos, polish with the concise default standard when no per-user standard is set).
