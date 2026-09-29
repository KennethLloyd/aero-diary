import './load-env';
import { getDemoCredentials } from '../src/lib/auth/demo-config';
import { createDatabaseClient, getDatabaseUrl } from '../src/lib/db-client';
import {
  createJournalMemoryWorkerClient,
  prepareJournalMemoryQueue,
  enqueueJournalMemoryJob,
} from '../src/lib/journal/memory-queue';

async function main(): Promise<void> {
  const database = createDatabaseClient();
  const boss = createJournalMemoryWorkerClient(getDatabaseUrl());
  const demoEmail = getDemoCredentials()?.email;
  let cursor: string | undefined;
  let queued = 0;

  try {
    await prepareJournalMemoryQueue(boss);
    while (true) {
      const entries = await database.entry.findMany({
        where: demoEmail ? { user: { email: { not: demoEmail } } } : undefined,
        orderBy: { id: 'asc' },
        take: 100,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: { id: true, userId: true },
      });
      if (entries.length === 0) break;

      for (const entry of entries) {
        await enqueueJournalMemoryJob(database, entry.id, entry.userId);
        queued += 1;
      }
      cursor = entries[entries.length - 1]?.id;
    }
    console.log(`Queued ${queued} private journal entries for memory indexing.`);
  } finally {
    await boss.stop();
    await database.$disconnect();
  }
}

main().catch(() => {
  console.error('Journal memory backfill failed.');
  process.exitCode = 1;
});
