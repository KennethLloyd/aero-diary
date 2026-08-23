# ADR-0011: Activity vocabularies are user-owned

**Status:** Accepted (2026-08-17)

## Context

Aero Diary has a private account and a configured demo account. Both can have entries with activity tags, but their vocabularies must remain independent: the demo must not expose the private account's imported tags, and the private account must not inherit configured-demo-only tags.

## Decision

Each `Activity` belongs to exactly one `User`. Activity listing, creation, rename, archival, and entry attachment are scoped to the authenticated user. Activity names are unique within a user's active vocabulary, while different users may use the same name independently.

The demo seed owns the configured-demo activities. The post-v1 import owns creation and resolution of the imported account's source-defined activities. There is no shared global activity vocabulary.

Archived activities remain owned by their original user and retain historical `EntryActivity` links, but they are unavailable for new entries.

## Consequences

- A demo seed can be rerun without changing the private account's activities.
- An import can be rerun without touching configured-demo data.
- Every activity read and mutation needs an authenticated user scope, including server actions and data-access helpers.
- Activity uniqueness must be enforced per user rather than globally.
