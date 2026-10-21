import './load-env';
import { Prisma } from '../src/generated/prisma/client';
import { getDemoCredentials } from '../src/lib/auth/demo-config';
import { createDatabaseClient, getDatabaseUrl } from '../src/lib/db-client';
import {
  memoryBackfillDateFilter,
  parseMemoryBackfillOptions,
  summarizeMemoryBackfill,
  type MemoryBackfillState,
} from '../src/lib/journal/memory-backfill';
import {
  JOURNAL_EMBEDDING_GENERATION,
  journalEmbeddingSourceHash,
} from '../src/lib/journal/memory-embeddings';
import {
  createJournalMemoryWorkerClient,
  prepareJournalMemoryQueue,
  enqueueJournalMemoryJob,
  JOURNAL_MEMORY_QUEUE,
} from '../src/lib/journal/memory-queue';

async function main(): Promise<void> {
  const options = parseMemoryBackfillOptions(process.argv.slice(2), 'text');
  const database = createDatabaseClient();
  const boss = options.enqueue ? createJournalMemoryWorkerClient(getDatabaseUrl()) : undefined;
  const demoEmail = getDemoCredentials()?.email;

  try {
    const entries = await database.entry.findMany({
      where: {
        userId: options.userId,
        ...(demoEmail ? { user: { email: { not: demoEmail } } } : {}),
        ...(options.entryIds.length ? { id: { in: options.entryIds } } : {}),
        journalDate: memoryBackfillDateFilter(options),
        ...(options.after
          ? {
              id: {
                gt: options.after,
                ...(options.entryIds.length ? { in: options.entryIds } : {}),
              },
            }
          : {}),
      },
      orderBy: { id: 'asc' },
      take: options.limit + 1,
      select: { id: true, userId: true, note: true, memoryGeneration: true },
    });
    const page = entries.slice(0, options.limit);
    const failedEntryIds = new Set<string>();
    const [queueTable] = await database.$queryRaw<{ present: boolean }[]>`
      SELECT to_regclass('pgboss.job') IS NOT NULL AS present
    `;

    if (queueTable?.present && page.length) {
      const failures = await database.$queryRaw<{ entryId: string }[]>(Prisma.sql`
        SELECT DISTINCT data->>'entryId' AS "entryId" FROM pgboss.job
        WHERE name = ${JOURNAL_MEMORY_QUEUE} AND state = 'failed'
          AND data->>'userId' = ${options.userId}
          AND data->>'entryId' IN (${Prisma.join(page.map((entry) => entry.id))})
      `);

      for (const failure of failures) failedEntryIds.add(failure.entryId);
    }

    const states: MemoryBackfillState[] = page.map((entry) => {
      const generation = entry.memoryGeneration;
      const current =
        generation &&
        generation.embeddingModel === JOURNAL_EMBEDDING_GENERATION.model &&
        generation.passageVersion === JOURNAL_EMBEDDING_GENERATION.passageVersion &&
        generation.sourceHash === journalEmbeddingSourceHash(entry.note);

      if (current) return 'current';
      if (failedEntryIds.has(entry.id)) return 'failed';

      return generation ? 'old' : 'missing';
    });
    let queued = 0;

    if (boss) {
      await prepareJournalMemoryQueue(boss);

      for (let index = 0; index < page.length; index += 1) {
        if (states[index] === 'current') continue;

        const entry = page[index];
        const jobId = await enqueueJournalMemoryJob(database, entry.id, entry.userId);

        if (jobId) queued += 1;
      }
    }

    console.log(
      JSON.stringify(
        {
          mode: options.enqueue ? 'enqueue' : 'dry-run',
          model: JOURNAL_EMBEDDING_GENERATION.model,
          examined: page.length,
          ...summarizeMemoryBackfill(states),
          queued,
          nextCursor: entries.length > options.limit ? page.at(-1)?.id : null,
          failureScope:
            'Retained failed pg-boss jobs for noncurrent entries in this page; expired jobs are not counted.',
        },
        null,
        2,
      ),
    );
  } finally {
    await boss?.stop();
    await database.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Journal memory backfill failed.');
  process.exitCode = 1;
});
