# ADR-0010: Legacy activity vocabulary is import-owned

**Status:** Accepted (2026-08-17)

The 25 legacy Daylio activity names and curated emoji map belong to the post-v1 import workflow in ticket #9, which resolves them into `Activity` rows for the imported real user idempotently. The entry-management feature in #3 provides CRUD and archival for rows in the current user's vocabulary but does not ship a runtime seed, so the import remains the single owner of legacy vocabulary creation.

The import must never reuse, mutate, or expose the configured demo account's activity rows. Configured-demo activities are created separately by `pnpm db:seed`.
