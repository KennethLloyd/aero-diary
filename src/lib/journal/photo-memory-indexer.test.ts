import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@/generated/prisma/client';
import type { PhotoStore } from '@/lib/drive/store';
import {
  processJournalPhotoMemory,
  isPhotoIndexingPaused,
  resumePhotoIndexing,
} from './photo-memory-indexer';
import { MemoryEmbeddingError } from './memory-embeddings';
import { journalPhotoSourceHash, getPhotoMemoryPreprocessingVersion } from './photo-memory-images';
import { JOURNAL_EMBEDDING_MODEL } from './memory-embeddings';

const photo = {
  id: 'photo',
  entryId: 'entry',
  drivePath: 'photos/hash.jpg',
  driveFileId: 'file',
  mimeType: 'image/jpeg',
  sizeBytes: null,
  sourceVersion: 1,
  updatedAt: new Date('2026-10-21'),
  entry: { userId: 'owner', user: { email: 'owner@example.com' } },
};

function database() {
  const transaction = {
    $queryRaw: vi.fn().mockResolvedValue([photo]),
    $executeRaw: vi.fn().mockResolvedValue(1),
    journalPhotoMemory: { upsert: vi.fn().mockResolvedValue({}) },
  };
  const db = {
    photo: { findFirst: vi.fn().mockResolvedValue(photo) },
    journalPhotoMemory: {
      findUnique: vi.fn().mockResolvedValue(null),
      count: vi.fn().mockResolvedValue(0),
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(async (callback) => callback(transaction)),
  };

  return { db: db as unknown as PrismaClient, mocks: db, transaction };
}

async function dependencies() {
  const bytes = await sharp({
    create: { width: 1024, height: 768, channels: 3, background: 'white' },
  })
    .jpeg()
    .toBuffer();

  return {
    store: {
      download: vi.fn(
        async () =>
          new ReadableStream({
            start(controller) {
              controller.enqueue(bytes);
              controller.close();
            },
          }),
      ),
    } as unknown as PhotoStore,
    embed: vi.fn().mockResolvedValue(Array(768).fill(0.1)),
  };
}

beforeEach(() => vi.stubEnv('PHOTO_INDEXING_ENABLED', 'true'));
afterEach(() => vi.unstubAllEnvs());

describe('photo indexing', () => {
  it('is disabled by default and does not touch photos', async () => {
    vi.stubEnv('PHOTO_INDEXING_ENABLED', 'false');
    const { db, mocks } = database();
    expect(await processJournalPhotoMemory(db, 'photo', 'owner')).toBe('disabled');
    expect(mocks.photo.findFirst).not.toHaveBeenCalled();
  });

  it('normalizes before inference and persists only after revalidating source', async () => {
    const { db, mocks, transaction } = database();
    const deps = await dependencies();
    expect(await processJournalPhotoMemory(db, 'photo', 'owner', deps)).toBe('indexed');
    expect(mocks.photo.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'photo', entry: { userId: 'owner' } } }),
    );
    expect(deps.embed).toHaveBeenCalledWith(expect.objectContaining({ width: 512, height: 384 }));
    expect(transaction.journalPhotoMemory.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          status: 'INDEXED',
          userId: 'owner',
          sourceHash: journalPhotoSourceHash(photo),
        }),
      }),
    );
    expect(transaction.$executeRaw).toHaveBeenCalled();
  });

  it('skips a current generation without fetching or inference', async () => {
    const { db, mocks } = database();
    mocks.journalPhotoMemory.findUnique.mockResolvedValue({
      status: 'INDEXED',
      sourceHash: journalPhotoSourceHash(photo),
      embeddingModel: JOURNAL_EMBEDDING_MODEL,
      preprocessingVersion: getPhotoMemoryPreprocessingVersion(),
    });
    const deps = await dependencies();
    expect(await processJournalPhotoMemory(db, 'photo', 'owner', deps)).toBe('current');
    expect(deps.embed).not.toHaveBeenCalled();
    expect(deps.store.download).not.toHaveBeenCalled();
  });

  it.each(['deleted', 'changed'])('does not persist %s source work', async (state) => {
    const { db, transaction } = database();
    transaction.$queryRaw.mockResolvedValue(
      state === 'deleted' ? [] : [{ ...photo, sourceVersion: 2 }],
    );
    expect(await processJournalPhotoMemory(db, 'photo', 'owner', await dependencies())).toBe(
      state === 'deleted' ? 'missing' : 'stale',
    );
    expect(transaction.journalPhotoMemory.upsert).not.toHaveBeenCalled();
  });

  it('records Drive failure without inference and malformed input as skipped', async () => {
    const { db, transaction } = database();
    const deps = await dependencies();
    vi.mocked(deps.store.download).mockRejectedValue(new Error('Drive unavailable'));
    expect(await processJournalPhotoMemory(db, 'photo', 'owner', deps)).toBe('failed');
    expect(transaction.journalPhotoMemory.upsert).toHaveBeenLastCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ status: 'FAILED', errorCode: 'DRIVE_DOWNLOAD' }),
      }),
    );
    expect(deps.embed).not.toHaveBeenCalled();

    vi.mocked(deps.store.download).mockResolvedValue(
      new ReadableStream({
        start(controller) {
          controller.enqueue(Buffer.from('corrupt'));
          controller.close();
        },
      }),
    );
    expect(await processJournalPhotoMemory(db, 'photo', 'owner', deps)).toBe('failed');
    expect(transaction.journalPhotoMemory.upsert).toHaveBeenLastCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ status: 'SKIPPED', errorCode: 'INVALID_IMAGE' }),
      }),
    );
  });

  it('records inference pause, persists no vector and allows explicit resume', async () => {
    const { db, mocks, transaction } = database();
    const deps = await dependencies();
    deps.embed.mockRejectedValue(new MemoryEmbeddingError('TRANSPORT', 'inference timeout'));
    expect(await processJournalPhotoMemory(db, 'photo', 'owner', deps)).toBe('paused');
    expect(transaction.journalPhotoMemory.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ status: 'PAUSED', errorCode: 'EMBEDDING_TRANSPORT' }),
      }),
    );
    mocks.journalPhotoMemory.count.mockResolvedValue(1);
    expect(await isPhotoIndexingPaused(db)).toBe(true);

    await resumePhotoIndexing(db);
    expect(mocks.journalPhotoMemory.updateMany).toHaveBeenCalledWith({
      where: { status: 'PAUSED' },
      data: { status: 'FAILED' },
    });
  });
});
