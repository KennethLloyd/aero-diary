import { beforeEach, describe, expect, it } from 'vitest';
import { resetTestDb, testDb } from '@/test/test-db';
import { preflightJournalPhotos, type JournalPhotoResolver } from '@/lib/journal/photo-preflight';

describe('journal photo preflight', () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  async function photoFixture() {
    const user = await testDb.user.create({ data: { email: 'private@example.com', passwordHash: 'x' } });
    const entry = await testDb.entry.create({
      data: {
        userId: user.id,
        sourceId: 1,
        date: new Date('2026-08-01T04:00:00Z'),
        localOffset: 480,
        mood: 'RAD',
        note: 'Synthetic photo fixture.',
        photos: { create: { drivePath: 'photos/example.jpg', mimeType: 'image/jpeg' } },
      },
    });
    return { user, entry };
  }

  it('reports a resolution without writing until explicit apply', async () => {
    const { user } = await photoFixture();
    const resolver: JournalPhotoResolver = {
      resolve: async (drivePath) => ({
        status: 'resolved',
        drivePath,
        fileId: 'drive-file',
        mimeType: 'image/jpeg',
      }),
    };

    const report = await preflightJournalPhotos(testDb, user.id, resolver);
    expect(report).toMatchObject({ total: 1, resolved: 1, applied: 0 });
    expect((await testDb.photo.findFirstOrThrow()).driveFileId).toBeNull();

    const applied = await preflightJournalPhotos(testDb, user.id, resolver, true);
    expect(applied.applied).toBe(1);
    expect((await testDb.photo.findFirstOrThrow()).driveFileId).toBe('drive-file');
  });

  it('blocks apply when a path is missing or duplicated', async () => {
    const { user } = await photoFixture();
    const resolver: JournalPhotoResolver = {
      resolve: async (drivePath) => ({ status: 'duplicate', drivePath, fileIds: ['one', 'two'] }),
    };

    const report = await preflightJournalPhotos(testDb, user.id, resolver);
    expect(report.duplicates).toEqual(['photos/example.jpg']);
    await expect(preflightJournalPhotos(testDb, user.id, resolver, true)).rejects.toThrow('cannot apply');
    expect((await testDb.photo.findFirstOrThrow()).driveFileId).toBeNull();
  });
});
