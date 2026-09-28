import './load-env';
import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Prisma } from '../src/generated/prisma/client';
import { createDatabaseClient, getDatabaseUrl } from '../src/lib/db-client';
import { getDemoCredentials } from '../src/lib/auth/demo-config';
import {
  createJournalMemoryWorkerClient,
  enqueueJournalMemoryJob,
  prepareJournalMemoryQueue,
} from '../src/lib/journal/memory-queue';

type ValueRow = Record<string, unknown>;

type TableSpec = {
  name: string
  columns: readonly string[]
  orderBy: readonly string[]
  dateColumns?: readonly string[]
  booleanColumns?: readonly string[]
};

const TABLES: readonly TableSpec[] = [
  { name: 'User', columns: ['id', 'email', 'passwordHash', 'name', 'styleStandard', 'appLockPinHash', 'appLockTimeoutMinutes', 'createdAt'], orderBy: ['id'], dateColumns: ['createdAt'] },
  { name: 'Session', columns: ['id', 'userId', 'tokenHash', 'expiresAt', 'appLockVerifiedAt', 'createdAt'], orderBy: ['id'], dateColumns: ['expiresAt', 'appLockVerifiedAt', 'createdAt'] },
  { name: 'Activity', columns: ['id', 'userId', 'name', 'emoji', 'isArchived', 'sortOrder'], orderBy: ['id'], booleanColumns: ['isArchived'] },
  { name: 'Entry', columns: ['id', 'sourceId', 'userId', 'journalDate', 'mood', 'note', 'activityInferenceStatus', 'isFavorite', 'createdAt', 'updatedAt'], orderBy: ['id'], dateColumns: ['createdAt', 'updatedAt'], booleanColumns: ['isFavorite'] },
  { name: 'EntryActivity', columns: ['entryId', 'activityId'], orderBy: ['entryId', 'activityId'] },
  { name: 'Photo', columns: ['id', 'entryId', 'drivePath', 'driveFileId', 'mimeType', 'sizeBytes', 'createdAt'], orderBy: ['id'], dateColumns: ['createdAt'] },
  { name: 'StagedPhoto', columns: ['id', 'userId', 'draftKey', 'clientKey', 'drivePath', 'driveFileId', 'mimeType', 'sizeBytes', 'createdAt'], orderBy: ['id'], dateColumns: ['createdAt'] },
  { name: 'StagedPhotoCancellation', columns: ['userId', 'draftKey', 'clientKey', 'stagedPhotoId', 'createdAt', 'expired'], orderBy: ['userId', 'draftKey', 'clientKey'], dateColumns: ['createdAt'], booleanColumns: ['expired'] },
];

const MEMORY_TABLES = ['JournalMemoryGeneration', 'JournalMemoryPassage'] as const;
const BATCH_SIZE = 250;

type CountQueryClient = {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>
};

function parseArguments(args: string[]): { sourcePath: string; confirmedEmptyTarget: boolean } {
  let sourcePath: string | undefined;
  let confirmedEmptyTarget = false;
  const options = args.filter((argument) => argument !== '--');
  for (let index = 0; index < options.length; index += 1) {
    const argument = options[index];
    if (argument === '--source') {
      sourcePath = options[index + 1];
      index += 1;
    } else if (argument === '--confirm-empty-target') {
      confirmedEmptyTarget = true;
    } else {
      throw new Error('Usage: pnpm db:import-sqlite -- --source <sqlite-file> --confirm-empty-target');
    }
  }
  if (!sourcePath || !confirmedEmptyTarget) {
    throw new Error('Usage: pnpm db:import-sqlite -- --source <sqlite-file> --confirm-empty-target');
  }
  return { sourcePath: path.resolve(sourcePath), confirmedEmptyTarget };
}

export function normalizeDate(value: unknown, field: string): Date | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new Error(`Invalid SQLite date in ${field}.`);
    return value;
  }
  let date: Date;
  if (typeof value === 'number') {
    date = new Date(value);
  } else if (typeof value === 'string') {
    const normalized = value.includes('T')
      ? value
      : value.replace(' ', 'T');
    const withTimezone = /(?:Z|[+-]\d\d(?::?\d\d)?)$/i.test(normalized)
      ? normalized
      : `${normalized}Z`;
    date = new Date(withTimezone);
  } else {
    throw new Error(`Unsupported SQLite date value in ${field}.`);
  }
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid SQLite date in ${field}.`);
  return date;
}

function normalizeValue(value: unknown, spec: TableSpec, column: string): unknown {
  if (spec.dateColumns?.includes(column)) {
    const date = normalizeDate(value, column);
    return date?.toISOString() ?? null;
  }
  if (spec.booleanColumns?.includes(column)) {
    if (value === null || value === undefined) return null;
    return value === true || value === 1 || value === '1';
  }
  return value ?? null;
}

function orderedDigestUpdate(hash: ReturnType<typeof createHash>, row: ValueRow, spec: TableSpec): void {
  const values = spec.columns.map((column) => normalizeValue(row[column], spec, column));
  hash.update(JSON.stringify(values));
  hash.update('\n');
}

function sqliteSelect(spec: TableSpec): string {
  const columns = spec.columns.map((column) => `"${column}"`).join(', ');
  const order = spec.orderBy.map((column) => `"${column}"`).join(', ');
  return `SELECT ${columns} FROM "${spec.name}" ORDER BY ${order}`;
}

function postgresInsert(spec: TableSpec): string {
  const columns = spec.columns.map((column) => `"${column}"`).join(', ');
  const placeholders = spec.columns.map((_, index) => `$${index + 1}`).join(', ');
  return `INSERT INTO "${spec.name}" (${columns}) VALUES (${placeholders})`;
}

function postgresPage(spec: TableSpec, offset: number): string {
  const columns = spec.columns.map((column) => `"${column}"`).join(', ');
  const order = spec.orderBy.map((column) => `"${column}"`).join(', ');
  return `SELECT ${columns} FROM "${spec.name}" ORDER BY ${order} LIMIT ${BATCH_SIZE} OFFSET ${offset}`;
}

async function assertEmptyTarget(database: CountQueryClient): Promise<void> {
  for (const table of [...TABLES.map(({ name }) => name), ...MEMORY_TABLES]) {
    const rows = await database.$queryRawUnsafe<{ count: bigint }[]>(`SELECT COUNT(*) AS count FROM "${table}"`);
    if (BigInt(rows[0]?.count ?? 0) !== BigInt(0)) {
      throw new Error('The PostgreSQL target must have no application data before import.');
    }
  }
}

async function transferTable(
  sqlite: Database.Database,
  transaction: Prisma.TransactionClient,
  spec: TableSpec,
): Promise<{ count: number; digest: string }> {
  const statement = sqlite.prepare(sqliteSelect(spec));
  const sourceDigest = createHash('sha256');
  const insertStatement = postgresInsert(spec);
  let count = 0;
  let batch: ValueRow[] = [];

  const writeBatch = async () => {
    for (const row of batch) {
      const values = spec.columns.map((column) => normalizeValue(row[column], spec, column));
      await transaction.$executeRawUnsafe(insertStatement, ...values);
    }
    batch = [];
  };

  for (const row of statement.iterate() as IterableIterator<ValueRow>) {
    orderedDigestUpdate(sourceDigest, row, spec);
    batch.push(row);
    count += 1;
    if (batch.length >= BATCH_SIZE) await writeBatch();
  }
  if (batch.length > 0) await writeBatch();

  const targetDigest = createHash('sha256');
  let targetCount = 0;
  while (true) {
    const rows = await transaction.$queryRawUnsafe<ValueRow[]>(postgresPage(spec, targetCount));
    if (rows.length === 0) break;
    for (const row of rows) {
      orderedDigestUpdate(targetDigest, row, spec);
      targetCount += 1;
    }
  }

  const sourceHash = sourceDigest.digest('hex');
  const targetHash = targetDigest.digest('hex');
  if (count !== targetCount || sourceHash !== targetHash) {
    throw new Error(`SQLite import verification failed for ${spec.name}.`);
  }
  return { count, digest: sourceHash };
}

async function main(): Promise<void> {
  const { sourcePath } = parseArguments(process.argv.slice(2));
  if (!existsSync(sourcePath)) throw new Error('The specified SQLite source file does not exist.');

  const sqlite = new Database(sourcePath, { readonly: true, fileMustExist: true });
  sqlite.pragma('query_only = ON');
  sqlite.exec('BEGIN');
  const database = createDatabaseClient();
  const queueSetup = createJournalMemoryWorkerClient(getDatabaseUrl());
  const counts: Record<string, number> = {};
  try {
    const foreignKeyErrors = sqlite.pragma('foreign_key_check') as unknown[];
    if (foreignKeyErrors.length > 0) throw new Error('The SQLite source contains broken foreign-key relationships.');
    await prepareJournalMemoryQueue(queueSetup);
    await database.$transaction(async (transaction) => {
      await assertEmptyTarget(transaction);
      for (const table of TABLES) {
        const result = await transferTable(sqlite, transaction, table);
        counts[table.name] = result.count;
      }

      const demoEmail = getDemoCredentials()?.email.toLowerCase();
      const users = await transaction.user.findMany({ select: { id: true, email: true } });
      const emailById = new Map(users.map(({ id, email }) => [id, email.toLowerCase()]));
      const entries = sqlite.prepare('SELECT "id", "userId" FROM "Entry" ORDER BY "id"').iterate() as IterableIterator<{ id: string; userId: string }>;
      for (const entry of entries) {
        const ownerEmail = emailById.get(entry.userId);
        if (!ownerEmail) throw new Error('SQLite import verification found an entry without its owner.');
        if (demoEmail && ownerEmail === demoEmail) continue;
        await enqueueJournalMemoryJob(database, entry.id, entry.userId, transaction);
      }
    }, { maxWait: 10_000, timeout: 600_000 });

    sqlite.exec('COMMIT');
    const summary = Object.entries(counts).map(([table, count]) => `${table}=${count}`).join(', ');
    console.log(`SQLite import completed and verified (${summary}).`);
    console.log('Record digests and source foreign-key relationships passed; private entries are queued for indexing.');
  } finally {
    sqlite.close();
    await queueSetup.stop();
    await database.$disconnect();
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'SQLite import failed.';
    console.error(message);
    process.exitCode = 1;
  });
}
