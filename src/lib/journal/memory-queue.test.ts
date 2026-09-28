import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Mood } from '@/generated/prisma/enums';
import { resetTestDb, testDb } from '@/test/test-db';
import {
  createJournalMemoryWorkerClient,
  enqueueJournalMemoryJob,
  JOURNAL_MEMORY_QUEUE,
  prepareJournalMemoryQueue,
} from '@/lib/journal/memory-queue';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) throw new Error('TEST_DATABASE_URL must point to an isolated PostgreSQL test database.');

const workerClient = createJournalMemoryWorkerClient(testDatabaseUrl);

describe('journal memory queue transaction binding', () => {
  beforeAll(async () => {
    await prepareJournalMemoryQueue(workerClient);
  });

  beforeEach(async () => {
    await resetTestDb();
    await workerClient.deleteQueuedJobs(JOURNAL_MEMORY_QUEUE);
  });

  afterAll(async () => {
    await workerClient.stop();
  });

  it('rolls back the indexing job when the entry transaction rolls back', async () => {
    const user = await testDb.user.create({
      data: { email: 'queue-rollback@example.com', passwordHash: 'x' },
    });
    const jobId = { value: null as string | null };

    await expect(testDb.$transaction(async (transaction) => {
      const entry = await transaction.entry.create({
        data: { userId: user.id, journalDate: '2026-09-29', mood: Mood.GOOD, note: 'Private test entry.' },
      });
      jobId.value = await enqueueJournalMemoryJob(testDb, entry.id, user.id, transaction);
      throw new Error('force transaction rollback');
    })).rejects.toThrow('force transaction rollback');

    expect(await testDb.entry.count({ where: { userId: user.id } })).toBe(0);
    expect(jobId.value).toBeTruthy();
    if (!jobId.value) throw new Error('The transaction did not return the created job ID.');
    await expect(workerClient.getJobById(JOURNAL_MEMORY_QUEUE, jobId.value)).resolves.toBeNull();
  });

  it('leaves the indexing job durable after the entry transaction commits', async () => {
    const user = await testDb.user.create({
      data: { email: 'queue-commit@example.com', passwordHash: 'x' },
    });
    const jobId = { value: null as string | null };

    await testDb.$transaction(async (transaction) => {
      const entry = await transaction.entry.create({
        data: { userId: user.id, journalDate: '2026-09-29', mood: Mood.GOOD, note: 'Private test entry.' },
      });
      jobId.value = await enqueueJournalMemoryJob(testDb, entry.id, user.id, transaction);
    });

    expect(jobId.value).toBeTruthy();
    if (!jobId.value) throw new Error('The transaction did not return the created job ID.');
    await expect(workerClient.getJobById(JOURNAL_MEMORY_QUEUE, jobId.value)).resolves.toMatchObject({
      data: { entryId: expect.any(String), userId: user.id },
      state: 'created',
    });
  });
});
