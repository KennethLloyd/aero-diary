import './load-env';
import { getDemoCredentials } from '../src/lib/auth/demo-config';
import { createDatabaseClient, getDatabaseUrl } from '../src/lib/db-client';
import {
  memoryBackfillDateFilter,
  parseMemoryBackfillOptions,
  summarizeMemoryBackfill,
  type MemoryBackfillState,
} from '../src/lib/journal/memory-backfill';
import { JOURNAL_EMBEDDING_MODEL } from '../src/lib/journal/memory-embeddings';
import { getPhotoMemoryConfig } from '../src/lib/journal/photo-memory-config';
import {
  journalPhotoSourceHash,
  getPhotoMemoryPreprocessingVersion,
} from '../src/lib/journal/photo-memory-images';
import {
  createJournalPhotoMemoryWorkerClient,
  enqueueJournalPhotoMemoryJob,
  prepareJournalPhotoMemoryQueue,
} from '../src/lib/journal/photo-memory-queue';

async function main(): Promise<void> {
  const options = parseMemoryBackfillOptions(process.argv.slice(2), 'photo');

  if (options.enqueue && !getPhotoMemoryConfig().indexingEnabled) {
    throw new Error('PHOTO_INDEXING_ENABLED must be true to enqueue photo work.');
  }

  const database = createDatabaseClient();
  const boss = options.enqueue ? createJournalPhotoMemoryWorkerClient(getDatabaseUrl()) : undefined;
  const demoEmail = getDemoCredentials()?.email;

  try {
    const photos = await database.photo.findMany({
      where: {
        ...(options.photoIds.length ? { id: { in: options.photoIds } } : {}),
        ...(options.after
          ? {
              id: {
                gt: options.after,
                ...(options.photoIds.length ? { in: options.photoIds } : {}),
              },
            }
          : {}),
        entry: {
          userId: options.userId,
          ...(demoEmail ? { user: { email: { not: demoEmail } } } : {}),
          ...(options.entryIds.length ? { id: { in: options.entryIds } } : {}),
          journalDate: memoryBackfillDateFilter(options),
        },
      },
      orderBy: { id: 'asc' },
      take: options.limit + 1,
      include: { memory: true },
    });
    const page = photos.slice(0, options.limit);
    const states: MemoryBackfillState[] = page.map((photo) => {
      const memory = photo.memory;

      if (!memory) return 'missing';

      const sameSource =
        memory.userId === options.userId &&
        memory.entryId === photo.entryId &&
        memory.sourceHash === journalPhotoSourceHash(photo) &&
        memory.embeddingModel === JOURNAL_EMBEDDING_MODEL &&
        memory.preprocessingVersion === getPhotoMemoryPreprocessingVersion();

      if (!sameSource) return 'old';
      if (memory.status === 'FAILED' || memory.status === 'PAUSED') return 'failed';
      if (memory.status === 'SKIPPED') return 'skipped';

      return memory.status === 'INDEXED' ? 'current' : 'old';
    });
    let queued = 0;

    if (boss) {
      await prepareJournalPhotoMemoryQueue(boss);

      for (let index = 0; index < page.length; index += 1) {
        if (states[index] === 'current') continue;

        const photo = page[index];
        const jobId = await enqueueJournalPhotoMemoryJob(database, photo.id, options.userId);

        if (jobId) queued += 1;
      }
    }

    console.log(
      JSON.stringify(
        {
          mode: options.enqueue ? 'enqueue' : 'dry-run',
          model: JOURNAL_EMBEDDING_MODEL,
          preprocessingVersion: getPhotoMemoryPreprocessingVersion(),
          examined: page.length,
          ...summarizeMemoryBackfill(states),
          queued,
          nextCursor: photos.length > options.limit ? page.at(-1)?.id : null,
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
  console.error(error instanceof Error ? error.message : 'Journal photo memory backfill failed.');
  process.exitCode = 1;
});
