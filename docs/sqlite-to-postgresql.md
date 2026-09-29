# SQLite to PostgreSQL

1. Pause Aero Diary writes and back up or copy the SQLite database. Keep the
   source unchanged through the transfer.
2. Set `DATABASE_URL` to a fresh PostgreSQL database with pgvector enabled, then
   run `pnpm db:setup`.
3. Import the copied database:

   ```bash
   pnpm db:import-sqlite -- --source /path/to/aero-diary.db --confirm-empty-target
   ```

   Keep the target empty with no other writers until import finishes. The
   importer opens SQLite read-only, checks relationships, row counts, and field
   digests, and commits the records and private-entry indexing jobs together.
4. Start Aero Diary and `pnpm memory:worker`; check the journal and let the
   worker index existing private entries.

If validation fails, discard the target and retry from the unchanged source.
If rolling back before accepting PostgreSQL writes, restore the old app with
the untouched SQLite database; never copy PostgreSQL writes back to SQLite.
