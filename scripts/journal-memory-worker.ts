import './load-env';
import { z } from 'zod';
import { createDatabaseClient, getDatabaseUrl } from '../src/lib/db-client';
import {
  createJournalMemoryWorkerClient,
  JOURNAL_MEMORY_QUEUE,
  JOURNAL_MEMORY_WORKER,
  prepareJournalMemoryQueue,
} from '../src/lib/journal/memory-queue';
import { processJournalMemoryEntry } from '../src/lib/journal/memory-indexer';

const jobDataSchema = z.object({
  entryId: z.string().min(1),
  userId: z.string().min(1),
});

async function main(): Promise<void> {
  const database = createDatabaseClient();
  const boss = createJournalMemoryWorkerClient(getDatabaseUrl());
  boss.on('error', () => console.error('Journal memory worker reported a queue error.'));
  boss.on('warning', () => console.warn('Journal memory queue warning.'));

  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    try {
      await boss.stop({ graceful: true, timeout: 30_000 });
    } finally {
      await database.$disconnect();
    }
  };
  process.on('SIGINT', () => { void shutdown(); });
  process.on('SIGTERM', () => { void shutdown(); });

  await prepareJournalMemoryQueue(boss);
  await boss.work<{ entryId: string; userId: string }>(
    JOURNAL_MEMORY_QUEUE,
    { batchSize: 1, localConcurrency: 1 },
    async (jobs) => {
      for (const job of jobs) {
        const parsed = jobDataSchema.safeParse(job.data);
        if (!parsed.success) throw new Error('Journal memory job data is invalid.');
        await processJournalMemoryEntry(database, parsed.data.entryId, parsed.data.userId);
      }
    },
  );
  console.log(`Journal memory worker ${JOURNAL_MEMORY_WORKER} is running.`);
}

main().catch(() => {
  console.error('Journal memory worker failed to start.');
  process.exitCode = 1;
});
