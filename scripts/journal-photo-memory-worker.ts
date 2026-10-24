import './load-env';
import { z } from 'zod';
import { createDatabaseClient, getDatabaseUrl } from '../src/lib/db-client';
import { getPhotoMemoryConfig } from '../src/lib/journal/photo-memory-config';
import {
  isPhotoIndexingPaused,
  processJournalPhotoMemory,
  resumePhotoIndexing,
} from '../src/lib/journal/photo-memory-indexer';
import {
  createJournalPhotoMemoryWorkerClient,
  JOURNAL_PHOTO_MEMORY_QUEUE,
  prepareJournalPhotoMemoryQueue,
} from '../src/lib/journal/photo-memory-queue';

const jobSchema = z.object({ photoId: z.string().min(1), userId: z.string().min(1) });

async function main(): Promise<void> {
  const database = createDatabaseClient();

  if (process.argv.slice(2).includes('--resume')) {
    try {
      await resumePhotoIndexing(database);
      console.log(
        'Photo inference pause acknowledged. Start the worker explicitly to resume pending work.',
      );
    } finally {
      await database.$disconnect();
    }

    return;
  }
  if (!getPhotoMemoryConfig().indexingEnabled) {
    await database.$disconnect();
    throw new Error('PHOTO_INDEXING_ENABLED must be true to start the photo worker.');
  }
  if (await isPhotoIndexingPaused(database)) {
    await database.$disconnect();
    throw new Error(
      'Photo indexing is paused after an inference failure. Inspect the failure, then run with --resume.',
    );
  }

  const boss = createJournalPhotoMemoryWorkerClient(getDatabaseUrl());
  let stopping = false;

  const shutdown = async () => {
    if (stopping) return;

    stopping = true;

    try {
      await boss.stop({ graceful: true, timeout: 30_000 });
    } finally {
      await database.$disconnect();
    }
  };

  process.on('SIGTERM', () => {
    void shutdown();
  });
  process.on('SIGINT', () => {
    void shutdown();
  });
  boss.on('error', () => console.error('Photo memory queue error.'));

  await prepareJournalPhotoMemoryQueue(boss);
  await boss.work<{ photoId: string; userId: string }>(
    JOURNAL_PHOTO_MEMORY_QUEUE,
    { batchSize: 1, localConcurrency: 1 },
    async (jobs) => {
      for (const job of jobs) {
        const { photoId, userId } = jobSchema.parse(job.data);
        const result = await processJournalPhotoMemory(database, photoId, userId);

        if (result === 'paused') {
          console.error(
            'Photo indexing paused after inference failure. Pending jobs remain queued.',
          );
          // Stop after this callback settles; awaiting graceful stop here would wait on itself.
          setImmediate(() => {
            void shutdown();
          });
          throw new Error('Photo inference failed. Explicit resume is required.');
        }
      }
    },
  );
  console.log('Photo memory worker started with concurrency 1; no historical work was scheduled.');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Photo memory worker failed.');
  process.exitCode = 1;
});
