import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetTestDb, testDb } from '@/test/test-db';
import type { PhotoStore } from '@/lib/drive/store';
import {
  deleteStagedPhoto,
  deleteStagedPhotoByKey,
  PHOTO_STAGE_MAX_AGE_MS,
  PhotoStageCancelledError,
  PhotoStageCapacityError,
  stagePhoto,
} from '@/lib/journal/photo-staging';

function createStore() {
  return {
    delete: vi.fn(),
    deleteById: vi.fn(),
    download: vi.fn(),
    resolve: vi.fn(),
    upload: vi.fn().mockResolvedValue({
      drivePath: 'photos/hash.jpg',
      fileId: 'drive-file',
      mimeType: 'image/jpeg',
    }),
  } as unknown as PhotoStore;
}

async function createUser() {
  return testDb.user.create({
    data: { email: `${crypto.randomUUID()}@example.com`, passwordHash: 'x' },
  });
}

describe('staged photo workflow', () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it('stores a Drive upload as a user-owned staged photo', async () => {
    const user = await createUser();
    const store = createStore();
    const file = new File(['photo'], 'photo.jpg', { type: 'image/jpeg' });

    const staged = await stagePhoto(testDb, store, {
      userId: user.id,
      draftKey: 'draft-1',
      clientKey: 'client-1',
      file,
    });

    expect(staged).toMatchObject({
      drivePath: 'photos/hash.jpg',
      driveFileId: 'drive-file',
      mimeType: 'image/jpeg',
      sizeBytes: file.size,
    });
    expect(await testDb.stagedPhoto.count({ where: { userId: user.id } })).toBe(1);
  });

  it('is idempotent for a retried client key', async () => {
    const user = await createUser();
    const store = createStore();
    const file = new File(['photo'], 'photo.jpg', { type: 'image/jpeg' });

    const first = await stagePhoto(testDb, store, {
      userId: user.id,
      draftKey: 'draft-1',
      clientKey: 'same-key',
      file,
    });
    const second = await stagePhoto(testDb, store, {
      userId: user.id,
      draftKey: 'draft-1',
      clientKey: 'same-key',
      file,
    });

    expect(second.id).toBe(first.id);
    expect(store.upload).toHaveBeenCalledTimes(1);
    expect(await testDb.stagedPhoto.count({ where: { userId: user.id } })).toBe(1);
  });

  it('expires abandoned stages before accepting another upload', async () => {
    const user = await createUser();
    const store = createStore();
    const expired = await testDb.stagedPhoto.create({
      data: {
        userId: user.id,
        draftKey: 'draft-1',
        clientKey: 'expired',
        drivePath: 'photos/expired.jpg',
        driveFileId: 'drive-expired',
        mimeType: 'image/jpeg',
        sizeBytes: 1,
        createdAt: new Date(Date.now() - PHOTO_STAGE_MAX_AGE_MS - 1),
      },
    });

    await stagePhoto(testDb, store, {
      userId: user.id,
      draftKey: 'draft-1',
      clientKey: 'new-photo',
      file: new File(['photo'], 'photo.jpg', { type: 'image/jpeg' }),
    });

    expect(await testDb.stagedPhoto.findUnique({ where: { id: expired.id } })).toBeNull();
    expect(store.delete).toHaveBeenCalledWith('photos/expired.jpg', 'drive-expired');
    expect(await testDb.stagedPhotoCancellation.findUnique({
      where: {
        userId_draftKey_clientKey: {
          userId: user.id,
          draftKey: 'draft-1',
          clientKey: 'expired',
        },
      },
    })).toMatchObject({ stagedPhotoId: expired.id, expired: true });
  });

  it('records a cancellation before a late upload can commit', async () => {
    const user = await createUser();
    const store = createStore();

    await expect(deleteStagedPhotoByKey(
      testDb,
      store,
      user.id,
      'draft-1',
      'cancelled',
    )).resolves.toBe(false);

    await expect(stagePhoto(testDb, store, {
      userId: user.id,
      draftKey: 'draft-1',
      clientKey: 'cancelled',
      file: new File(['photo'], 'photo.jpg', { type: 'image/jpeg' }),
    })).rejects.toBeInstanceOf(PhotoStageCancelledError);
    expect(store.upload).not.toHaveBeenCalled();
  });

  it('cleans Drive when cancellation wins during an upload', async () => {
    const user = await createUser();
    const store = createStore();
    vi.mocked(store.upload).mockImplementationOnce(async () => {
      await deleteStagedPhotoByKey(testDb, store, user.id, 'draft-1', 'race');
      return {
        drivePath: 'photos/race.jpg',
        fileId: 'drive-race',
        mimeType: 'image/jpeg',
      };
    });

    await expect(stagePhoto(testDb, store, {
      userId: user.id,
      draftKey: 'draft-1',
      clientKey: 'race',
      file: new File(['photo'], 'photo.jpg', { type: 'image/jpeg' }),
    })).rejects.toBeInstanceOf(PhotoStageCancelledError);
    expect(store.deleteById).toHaveBeenCalledWith('drive-race');
    expect(await testDb.stagedPhoto.count()).toBe(0);
  });

  it('rejects a new stage after ten staged photos without calling Drive', async () => {
    const user = await createUser();
    const store = createStore();
    await Promise.all(Array.from({ length: 10 }, (_, index) => testDb.stagedPhoto.create({
      data: {
        userId: user.id,
        draftKey: 'draft-1',
        clientKey: `existing-${index}`,
        drivePath: `photos/${index}.jpg`,
        driveFileId: `drive-${index}`,
        mimeType: 'image/jpeg',
        sizeBytes: 1,
      },
    })));

    await expect(stagePhoto(testDb, store, {
      userId: user.id,
      draftKey: 'draft-1',
      clientKey: 'eleventh',
      file: new File(['photo'], 'photo.jpg', { type: 'image/jpeg' }),
    })).rejects.toBeInstanceOf(PhotoStageCapacityError);
    expect(store.upload).not.toHaveBeenCalled();
  });

  it('commits staged-row removal before best-effort Drive cleanup', async () => {
    const user = await createUser();
    const store = createStore();
    const staged = await testDb.stagedPhoto.create({
      data: {
        userId: user.id,
        draftKey: 'draft-1',
        clientKey: 'remove-me',
        drivePath: 'photos/remove.jpg',
        driveFileId: 'drive-remove',
        mimeType: 'image/jpeg',
        sizeBytes: 1,
      },
    });
    vi.mocked(store.delete).mockRejectedValueOnce(new Error('Drive unavailable'));

    await expect(deleteStagedPhoto(testDb, store, user.id, staged.id)).resolves.toBe(true);

    expect(await testDb.stagedPhoto.findUnique({ where: { id: staged.id } })).toBeNull();
    expect(store.delete).toHaveBeenCalledWith('photos/remove.jpg', 'drive-remove');
    expect(await testDb.stagedPhotoCancellation.findUnique({
      where: {
        userId_draftKey_clientKey: {
          userId: user.id,
          draftKey: 'draft-1',
          clientKey: 'remove-me',
        },
      },
    })).not.toBeNull();
  });

  it('deletes a staged photo by its draft and client keys', async () => {
    const user = await createUser();
    const store = createStore();
    const staged = await testDb.stagedPhoto.create({
      data: {
        userId: user.id,
        draftKey: 'draft-1',
        clientKey: 'lost-response',
        drivePath: 'photos/lost-response.jpg',
        driveFileId: 'drive-lost-response',
        mimeType: 'image/jpeg',
        sizeBytes: 1,
      },
    });

    await expect(deleteStagedPhotoByKey(
      testDb,
      store,
      user.id,
      staged.draftKey,
      staged.clientKey,
    )).resolves.toBe(true);

    expect(await testDb.stagedPhoto.findUnique({ where: { id: staged.id } })).toBeNull();
    expect(store.delete).toHaveBeenCalledWith('photos/lost-response.jpg', 'drive-lost-response');
    expect(await testDb.stagedPhotoCancellation.findUnique({
      where: {
        userId_draftKey_clientKey: {
          userId: user.id,
          draftKey: staged.draftKey,
          clientKey: staged.clientKey,
        },
      },
    })).not.toBeNull();
  });
});
