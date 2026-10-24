import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { resetTestDb, testDb } from '@/test/test-db';
import type { PhotoStore } from '@/lib/drive/store';
import { MemoryEmbeddingError } from './memory-embeddings';
import {
  isPhotoIndexingPaused,
  processJournalPhotoMemory,
  resumePhotoIndexing,
} from './photo-memory-indexer';
import {
  createJournalPhotoMemoryWorkerClient,
  enqueueJournalPhotoMemoryJob,
  JOURNAL_PHOTO_MEMORY_QUEUE,
  prepareJournalPhotoMemoryQueue,
} from './photo-memory-queue';

const boss = createJournalPhotoMemoryWorkerClient(process.env.TEST_DATABASE_URL!);
let userId: string;
let photoId: string;
let bytes: Buffer;
const vector = [1, ...Array(767).fill(0)];
const store: PhotoStore = {
  upload: vi.fn(),
  resolve: vi.fn(),
  delete: vi.fn(),
  deleteById: vi.fn(),
  download: async () =>
    new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(bytes));
        controller.close();
      },
    }),
};

describe('photo memory persistence and durable jobs', () => {
  beforeAll(async () => {
    bytes = await sharp({ create: { width: 32, height: 24, channels: 3, background: '#aabbcc' } })
      .jpeg()
      .toBuffer();
    await prepareJournalPhotoMemoryQueue(boss);
  });

  beforeEach(async () => {
    vi.stubEnv('PHOTO_INDEXING_ENABLED', 'true');
    await resetTestDb();
    await boss.deleteQueuedJobs(JOURNAL_PHOTO_MEMORY_QUEUE);
    const user = await testDb.user.create({
      data: { email: 'photo-db@example.test', passwordHash: 'x' },
    });
    userId = user.id;
    const entry = await testDb.entry.create({
      data: { userId, journalDate: '2026-10-01', mood: 'GOOD', note: 'A museum day.' },
    });
    const photo = await testDb.photo.create({
      data: { entryId: entry.id, drivePath: 'photos/synthetic.jpg', mimeType: 'image/jpeg' },
    });
    photoId = photo.id;
  });

  afterEach(() => vi.unstubAllEnvs());
  afterAll(async () => {
    await boss.stop();
  });

  it('persists one current generation and cascades it when the source photo is deleted', async () => {
    const embed = vi.fn(async () => vector);

    expect(await processJournalPhotoMemory(testDb, photoId, userId, { store, embed })).toBe(
      'indexed',
    );
    expect(await processJournalPhotoMemory(testDb, photoId, userId, { store, embed })).toBe(
      'current',
    );

    expect(embed).toHaveBeenCalledTimes(1);
    const [row] = await testDb.$queryRaw<
      { dimensions: number; status: string }[]
    >`SELECT vector_dims(embedding) AS dimensions, status FROM "JournalPhotoMemory" WHERE "photoId" = ${photoId}`;
    expect(row).toEqual({ dimensions: 768, status: 'INDEXED' });

    await testDb.photo.delete({ where: { id: photoId } });

    expect(await testDb.journalPhotoMemory.count()).toBe(0);
  });

  it('discards stale work without resurrecting a deleted photo', async () => {
    const embed = async () => {
      await testDb.photo.delete({ where: { id: photoId } });

      return vector;
    };

    expect(await processJournalPhotoMemory(testDb, photoId, userId, { store, embed })).toBe(
      'missing',
    );
    expect(await testDb.journalPhotoMemory.count()).toBe(0);
  });

  it('discards work when a source changes during inference and permits an explicit retry', async () => {
    const embed = async () => {
      await testDb.photo.update({
        where: { id: photoId },
        data: { sourceVersion: { increment: 1 } },
      });

      return vector;
    };

    expect(await processJournalPhotoMemory(testDb, photoId, userId, { store, embed })).toBe(
      'stale',
    );
    expect(await testDb.journalPhotoMemory.count()).toBe(0);
    expect(
      await processJournalPhotoMemory(testDb, photoId, userId, {
        store,
        embed: async () => vector,
      }),
    ).toBe('indexed');
  });

  it('persists inference failure and a restart-safe pause until explicit acknowledgement', async () => {
    const embed = async () => {
      throw new MemoryEmbeddingError('TRANSPORT', 'Ollama timed out.');
    };

    expect(await processJournalPhotoMemory(testDb, photoId, userId, { store, embed })).toBe(
      'paused',
    );
    expect(await isPhotoIndexingPaused(testDb)).toBe(true);
    expect(await testDb.journalPhotoMemory.findUnique({ where: { photoId } })).toMatchObject({
      status: 'PAUSED',
      errorCode: 'EMBEDDING_TRANSPORT',
    });

    await resumePhotoIndexing(testDb);

    expect(await isPhotoIndexingPaused(testDb)).toBe(false);
    expect(await testDb.journalPhotoMemory.findUnique({ where: { photoId } })).toMatchObject({
      status: 'FAILED',
    });
  });

  it('does not fetch another owner’s photo or create jobs when indexing is disabled', async () => {
    const download = vi.spyOn(store, 'download');

    expect(await processJournalPhotoMemory(testDb, photoId, 'other-user', { store })).toBe(
      'missing',
    );
    expect(download).not.toHaveBeenCalled();
    download.mockRestore();
    vi.stubEnv('PHOTO_INDEXING_ENABLED', 'false');

    await expect(enqueueJournalPhotoMemoryJob(testDb, photoId, userId)).rejects.toThrow('disabled');
  });

  it('rolls back a new-photo job together with its attachment transaction', async () => {
    let jobId: string | null = null;

    await expect(
      testDb.$transaction(async (transaction) => {
        jobId = await enqueueJournalPhotoMemoryJob(testDb, photoId, userId, transaction);
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');

    expect(jobId).toBeTruthy();
    expect(await boss.getJobById(JOURNAL_PHOTO_MEMORY_QUEUE, jobId!)).toBeNull();
  });

  it('queue setup schedules no photos and singleton policy bounds active work globally', async () => {
    await prepareJournalPhotoMemoryQueue(boss);

    const [before] = await testDb.$queryRaw<
      { count: number }[]
    >`SELECT count(*)::int AS count FROM pgboss.job WHERE name = ${JOURNAL_PHOTO_MEMORY_QUEUE} AND state = 'created'`;
    expect(before.count).toBe(0);
    const queue = await boss.getQueue(JOURNAL_PHOTO_MEMORY_QUEUE);
    expect(queue?.policy).toBe('singleton');

    await enqueueJournalPhotoMemoryJob(testDb, photoId, userId);
    await enqueueJournalPhotoMemoryJob(testDb, photoId, userId);
    const first = await boss.fetch(JOURNAL_PHOTO_MEMORY_QUEUE, { batchSize: 1 });
    const second = await boss.fetch(JOURNAL_PHOTO_MEMORY_QUEUE, { batchSize: 1 });

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(0);
    await boss.complete(JOURNAL_PHOTO_MEMORY_QUEUE, first[0].id);
  });
});
