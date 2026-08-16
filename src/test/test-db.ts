import Database from 'better-sqlite3'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { PrismaClient } from '@/generated/prisma/client'

// Throwaway temp-file SQLite DB with the real migration schema applied.
// The adapter strips `file:` and opens the path directly, so pre-seed the file.
const MIGRATION_SQL = readFileSync(
  path.resolve(
    process.cwd(),
    'prisma/migrations/20260816073032_init/migration.sql',
  ),
  'utf8',
)

const dir = mkdtempSync(path.join(tmpdir(), 'aero-diary-test-'))
const dbPath = path.join(dir, 'test.db')
const sqlite = new Database(dbPath)
sqlite.exec(MIGRATION_SQL)
sqlite.close()

export const testDb = new PrismaClient({
  adapter: new PrismaBetterSqlite3({ url: `file:${dbPath}` }),
})

// Truncate all tables between tests (children before parents for FKs).
export async function resetTestDb(): Promise<void> {
  await testDb.session.deleteMany()
  await testDb.entryActivity.deleteMany()
  await testDb.photo.deleteMany()
  await testDb.entry.deleteMany()
  await testDb.activity.deleteMany()
  await testDb.user.deleteMany()
}