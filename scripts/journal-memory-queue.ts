import './load-env';
import {
  createJournalMemoryWorkerClient,
  JOURNAL_MEMORY_QUEUE,
  prepareJournalMemoryQueue,
} from '../src/lib/journal/memory-queue';
import { getDatabaseUrl } from '../src/lib/db-client';

async function main(): Promise<void> {
  const boss = createJournalMemoryWorkerClient(getDatabaseUrl());
  try {
    await prepareJournalMemoryQueue(boss);
    console.log(`Journal memory queue ${JOURNAL_MEMORY_QUEUE} is ready.`);
  } finally {
    await boss.stop();
  }
}

main().catch(() => {
  console.error('Journal memory queue setup failed.');
  process.exitCode = 1;
});
