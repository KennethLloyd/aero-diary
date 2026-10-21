import { PgBoss } from 'pg-boss';
import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import { getPhotoMemoryConfig } from '@/lib/journal/photo-memory-config';

export const JOURNAL_PHOTO_MEMORY_QUEUE = 'journal-photo-embedding';

export function createJournalPhotoMemoryWorkerClient(connectionString: string): PgBoss {
  return new PgBoss({ connectionString, schema: 'pgboss', max: 2, connectionTimeoutMillis: 5_000 });
}

export async function prepareJournalPhotoMemoryQueue(boss: PgBoss): Promise<void> {
  await boss.start();
  await boss.createQueue(JOURNAL_PHOTO_MEMORY_QUEUE, {
    policy: 'singleton',
    retryLimit: 0,
    expireInSeconds: 300,
    retentionSeconds: 604_800,
  });
}

const clients = new WeakMap<PrismaClient, PgBoss>();

export async function enqueueJournalPhotoMemoryJob(
  database: PrismaClient,
  photoId: string,
  userId: string,
  transaction?: Prisma.TransactionClient,
): Promise<string | null> {
  if (!getPhotoMemoryConfig().indexingEnabled) throw new Error('Photo indexing is disabled.');

  let boss = clients.get(database);

  if (!boss) {
    boss = new PgBoss({
      schema: 'pgboss',
      db: {
        async executeSql(text, values = []) {
          return {
            rows: await database.$queryRawUnsafe<Record<string, unknown>[]>(text, ...values),
          };
        },
      },
    });
    clients.set(database, boss);
  }

  return boss.send(
    JOURNAL_PHOTO_MEMORY_QUEUE,
    { photoId, userId },
    {
      retryLimit: 0,
      ...(transaction
        ? {
            db: {
              async executeSql(text: string, values: unknown[] = []) {
                return {
                  rows: await transaction.$queryRawUnsafe<Record<string, unknown>[]>(
                    text,
                    ...values,
                  ),
                };
              },
            },
          }
        : {}),
    },
  );
}
