# ADR-0006: Seed data & demo user

**Status:** Accepted (2026-08-16)

## Context

Kenneth demos Aero Diary without logging into his real account and without exposing his real entries. The demo must look alive: calendar with mood dots, insights with distributions, timeline with variety.

## Decision

- `prisma seed` creates:
  - **Demo user** (`demo@aerodiary.local`, password `demo`-style or a one-tap **"Try the demo"** button on the login screen that opens a demo session directly — no typing).
  - **90 days of fictional entries** ending "today", covering all 5 moods (weighted like a real life: mostly Good/Rad, some Meh, rare Bad/Awful), ~8 demo-owned activities, a handful of stock photos (not Kenneth's).
  - Fictional-but-plausible content (no real people, places, or events from Kenneth's life).
- Demo data is fully `userId`-scoped — the real user and demo user can never see each other's entries.
- Demo activity rows are also fully `userId`-scoped — they are visible only to the demo user and are never shared with or reused by the real user's vocabulary.
- The seed is deterministic and re-runnable (`prisma db seed` resets demo data only, never touches the real user).

## Consequences

- Demo is one click away, zero risk of leaking real entries.
- Insights/calendar/stats look believable in a demo without 7 years of data.
- The demo user exercises the same code paths as the real user (auth, entries, photos, polish with a generic standard).
