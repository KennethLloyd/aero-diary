# ADR-0010: Import activity vocabulary is template-owned

**Status:** Accepted (2026-08-17)

The import template owns the activity names and optional emoji definitions. The import workflow in ticket #9 resolves those definitions into `Activity` rows for the selected user idempotently. The entry-management feature in #3 provides CRUD and archival for rows in the current user's vocabulary but does not ship a runtime seed, so the import remains the single owner of import-time vocabulary resolution.

The import must never reuse, mutate, or expose the configured demo account's activity rows. Configured-demo activities are created separately by `pnpm db:seed`.
