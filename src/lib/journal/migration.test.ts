import Database from 'better-sqlite3';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationRoot = path.resolve(process.cwd(), 'prisma/migrations');
const targetMigration = '20260826000000_journal_date';
function readMigration(name: string): string {
  return readFileSync(path.join(migrationRoot, name, 'migration.sql'), 'utf8');
}

function readMigrations(before?: string): string {
  return readdirSync(migrationRoot)
    .filter((name) => name !== 'migration_lock.toml' && (!before || name < before))
    .sort()
    .map((name) => readMigration(name))
    .join('\n');
}

describe('journal date migration', () => {
  it('preserves the visible local journal day while removing timestamp fields', () => {
    const database = new Database(':memory:');
    try {
      database.exec(readMigrations(targetMigration));
      database.exec(`
        INSERT INTO "User" ("id", "email", "passwordHash")
        VALUES ('user-1', 'user@example.com', 'hash');
        INSERT INTO "Entry" ("id", "userId", "date", "localOffset", "mood", "note", "updatedAt")
        VALUES
          ('entry-a', 'user-1', '2026-08-24T23:30:00.000+00:00', 120, 'GOOD', 'Ahead of UTC.', CURRENT_TIMESTAMP),
          ('entry-b', 'user-1', '2026-08-25T01:30:00.000+00:00', -420, 'MEH', 'Behind UTC.', CURRENT_TIMESTAMP);
      `);

      database.exec(readMigration(targetMigration));

      const entries = database
        .prepare('SELECT "id", "journalDate" FROM "Entry" ORDER BY "id"')
        .all() as { id: string; journalDate: string }[];
      const columns = database.prepare('PRAGMA table_info("Entry")').all() as { name: string }[];

      expect(entries).toEqual([
        { id: 'entry-a', journalDate: '2026-08-25' },
        { id: 'entry-b', journalDate: '2026-08-24' },
      ]);
      expect(columns.map(({ name }) => name)).not.toEqual(expect.arrayContaining(['date', 'localOffset']));
      expect(columns.map(({ name }) => name)).toContain('journalDate');
    } finally {
      database.close();
    }
  });
});
