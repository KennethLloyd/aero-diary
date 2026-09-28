# SQLite to PostgreSQL migration

Aero Diary now runs on PostgreSQL with the `vector` extension. The importer is
for a rehearsed, one-time transfer of the existing SQLite database. It opens
the source read-only, requires an empty PostgreSQL target, and commits the
application rows and private-entry indexing jobs together. It does not copy
embedding data; the worker creates that data locally after the transfer.

## Rehearse the transfer

1. Pause Aero Diary writes, make a filesystem copy of the SQLite database, and
   record its path. Keep the original database unchanged.
2. Start a fresh PostgreSQL database with pgvector, configure `DATABASE_URL`
   for that target, install dependencies, and run `pnpm db:setup`.
3. Run the importer against the copy, with the explicit empty-target flag:

   ```bash
   pnpm db:import-sqlite -- --source /path/to/aero-diary.db --confirm-empty-target
   ```

   The target must be an isolated, empty database with no other writers until
   the import finishes. The importer stops if any application tables contain
   rows.
4. Confirm the command reports matching per-table counts, record digests, and
   valid source relationships. These checks compare the preserved IDs,
   ownership, credentials, sessions, journal dates, moods, notes, activities,
   photo and Drive references, and compatibility fields. The SQLite source is
   opened read-only and is not modified.
5. Point the application at the PostgreSQL target, start the separate
   `pnpm memory:worker` process, and verify login, timeline, editing, activities,
   photos, and App Lock against representative accounts. Confirm the worker
   drains the imported private-entry jobs. The configured demo account is
   excluded from memory indexing.

## Rollback

Keep the SQLite source and its backup unchanged until the PostgreSQL instance
has passed the rehearsal and application checks. Import validation failures
roll back the PostgreSQL transfer transaction; discard that isolated target and
repeat on a fresh one. For a production cutover, keep the old SQLite deployment
and database available during the acceptance window. If post-import acceptance
fails, stop writes to PostgreSQL and restore the previous application
configuration and SQLite deployment. Do not copy PostgreSQL changes back into
the old SQLite database.

## Memory worker operations

The app enqueues only an entry ID and owner ID in the same PostgreSQL
transaction as each note save. A worker process calls the configured local
Ollama service with `embeddinggemma:300m-qat-q4_0`; it can be started or
restarted independently. pg-boss retries failures a bounded number of times.
After retries are exhausted, restore Ollama/database availability and run
`pnpm memory:backfill` to requeue private entries. Check the queue and worker
logs for operational status; journal note text is not written to logs.

The issue-87 implementation was exercised with the Q4 model on a local
Apple-silicon development machine. The production OCI host is CPU-only
(4 vCPUs, approximately 12 GB available RAM); its throughput, peak memory, and
worker drain time still need measurement on that host before setting production
concurrency or latency expectations. Keep the worker at concurrency one until
that measurement is complete.
