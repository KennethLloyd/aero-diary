import { PgBoss } from 'pg-boss';
import type { Prisma, PrismaClient } from '@/generated/prisma/client';

export const JOURNAL_MEMORY_QUEUE = 'journal-memory-embedding';
export const JOURNAL_MEMORY_WORKER = 'journal-memory-index-entry';

const QUEUE_OPTIONS = {
  retryLimit: 12,
  retryDelay: 10,
  retryDelayMax: 600,
  retryBackoff: true,
  expireInSeconds: 300,
  retentionSeconds: 604_800,
};

type PrismaSqlClient = {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>
};

type QueueDatabase = {
  executeSql(text: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>
};

function prismaDb(client: PrismaSqlClient): QueueDatabase {
  return {
    async executeSql(text, values = []) {
      const rows = await client.$queryRawUnsafe<Record<string, unknown>[]>(text, ...values);
      return { rows };
    },
  };
}

const queueClients = new WeakMap<PrismaClient, PgBoss>();

export function getJournalMemoryQueueClient(database: PrismaClient): PgBoss {
  const existing = queueClients.get(database);
  if (existing) return existing;

  const boss = new PgBoss({
    db: prismaDb(database),
    schema: 'pgboss',
  });
  queueClients.set(database, boss);
  return boss;
}

export function createJournalMemoryWorkerClient(connectionString: string): PgBoss {
  return new PgBoss({
    connectionString,
    schema: 'pgboss',
    max: 4,
    connectionTimeoutMillis: 5_000,
  });
}

export async function prepareJournalMemoryQueue(boss: PgBoss): Promise<void> {
  await boss.start();
  await boss.createQueue(JOURNAL_MEMORY_QUEUE, QUEUE_OPTIONS);
}

export async function enqueueJournalMemoryJob(
  database: PrismaClient,
  entryId: string,
  userId: string,
  transaction?: Prisma.TransactionClient,
): Promise<string | null> {
  return getJournalMemoryQueueClient(database).send(
    JOURNAL_MEMORY_QUEUE,
    { entryId, userId },
    transaction ? { db: prismaDb(transaction) } : undefined,
  );
}
