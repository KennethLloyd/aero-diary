import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Mood } from '@/generated/prisma/enums';
import { resetTestDb, testDb } from '@/test/test-db';
const mocks = vi.hoisted(() => ({
  after: vi.fn(),
  deleteById: vi.fn(),
  deletePhotoFile: vi.fn(),
  getPhotoStore: vi.fn(),
  resolve: vi.fn(),
  redirect: vi.fn(),
  revalidatePath: vi.fn(),
  updateTag: vi.fn(),
  upload: vi.fn(),
  verifySession: vi.fn(),
}));

vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('next/server', () => ({ after: mocks.after }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath, updateTag: mocks.updateTag }));
vi.mock('@/lib/dal', () => ({ verifySession: mocks.verifySession }));
vi.mock('@/lib/drive/server-store', () => ({ getPhotoStore: mocks.getPhotoStore }));
vi.mock('@/lib/db', async () => {
  const { testDb } = await import('@/test/test-db');
  return { db: testDb };
});

import { DELETE as deleteStagedPhotoByKey, POST as stagePhotoUpload } from '@/app/api/photo-stages/route';
import { createEntry, deleteEntry, deletePhoto, updateEntry } from '@/actions/entries';

const NEXT_REDIRECT = 'NEXT_REDIRECT';

function form(photo?: File, stagedPhotoId?: string) {
  const data = new FormData();
  data.set('mood', Mood.RAD);
  data.set('note', 'A memory with a photo.');
  data.set('clientKey', 'client-1');
  data.set('draftKey', 'draft-1');
  if (photo) data.append('photo', photo);
  if (stagedPhotoId) data.set('stagedPhotoId', stagedPhotoId);
  return data;
}

describe('entry photo actions', () => {
  beforeEach(async () => {
    await resetTestDb();
    vi.clearAllMocks();
    mocks.redirect.mockImplementation(() => {
      throw new Error(NEXT_REDIRECT);
    });
    mocks.getPhotoStore.mockReturnValue({
      delete: mocks.deletePhotoFile,
      deleteById: mocks.deleteById,
      download: vi.fn(),
      resolve: mocks.resolve,
      upload: mocks.upload,
    });
    mocks.upload.mockResolvedValue({
      drivePath: 'photos/hash.jpg',
      fileId: 'drive-file',
      mimeType: 'image/jpeg',
    });
    mocks.resolve.mockResolvedValue({
      status: 'resolved',
      drivePath: 'photos/legacy-existing.jpg',
      fileId: 'legacy-drive-file',
      mimeType: 'image/jpeg',
      sizeBytes: 1,
    });
  });
  it('stages selected photos before saving and attaches the durable upload', async () => {
    const user = await testDb.user.create({
      data: { email: 'ken@example.com', passwordHash: 'x' },
    });
    mocks.verifySession.mockResolvedValue({ isAuth: true, userId: user.id });
    const photo = new File(['photo'], 'photo.jpg', { type: 'image/jpeg' });

    const stagedResponse = await stagePhotoUpload(new Request('http://localhost/api/photo-stages', {
      method: 'POST',
      body: form(photo),
    }));
    expect(stagedResponse.status).toBe(200);
    const staged = await stagedResponse.json() as { id: string };

    await expect(createEntry(undefined, form(undefined, staged.id))).rejects.toThrow(NEXT_REDIRECT);

    const entry = await testDb.entry.findFirstOrThrow({ include: { photos: true } });
    expect(entry.photos).toMatchObject([
      { driveFileId: 'drive-file', drivePath: 'photos/hash.jpg', mimeType: 'image/jpeg' },
    ]);
    expect(mocks.upload).toHaveBeenCalledTimes(1);
    expect(mocks.getPhotoStore).toHaveBeenCalledTimes(2);
    expect(mocks.upload.mock.calls[0]?.[0]).toMatchObject({ type: 'image/jpeg' });
    expect(await testDb.stagedPhoto.count()).toBe(0);
  });

  it('saves text when an attached stage has expired', async () => {
    const user = await testDb.user.create({
      data: { email: 'expired@example.com', passwordHash: 'x' },
    });
    mocks.verifySession.mockResolvedValue({ isAuth: true, userId: user.id });
    const expired = await testDb.stagedPhoto.create({
      data: {
        userId: user.id,
        draftKey: 'draft-1',
        clientKey: 'expired',
        drivePath: 'photos/expired.jpg',
        driveFileId: 'drive-expired',
        mimeType: 'image/jpeg',
        sizeBytes: 1,
        createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
      },
    });


    await expect(createEntry(undefined, form(undefined, expired.id))).rejects.toThrow(NEXT_REDIRECT);
    await expect(testDb.entry.findFirst({ where: { userId: user.id } })).resolves.toMatchObject({
      note: 'A memory with a photo.',
    });
    expect(await testDb.photo.count()).toBe(0);
  });
  it('does not create a duplicate attachment when the save is retried', async () => {
    const user = await testDb.user.create({
      data: { email: 'ken@example.com', passwordHash: 'x' },
    });
    mocks.verifySession.mockResolvedValue({ isAuth: true, userId: user.id });
    const stagedResponse = await stagePhotoUpload(new Request('http://localhost/api/photo-stages', {
      method: 'POST',
      body: form(new File(['photo'], 'photo.jpg', { type: 'image/jpeg' })),
    }));
    const staged = await stagedResponse.json() as { id: string };
    const stagedForm = form(undefined, staged.id);

    await expect(createEntry(undefined, stagedForm)).rejects.toThrow(NEXT_REDIRECT);
    await expect(createEntry(undefined, stagedForm)).resolves.toEqual({
      error: 'Unable to save your photos. Please try again.',
    });

    expect(await testDb.entry.count({ where: { userId: user.id } })).toBe(1);
    expect(await testDb.photo.count()).toBe(1);
  });
  it('does not attach a twenty-first photo while editing a full entry', async () => {
    const user = await testDb.user.create({
      data: { email: 'ken@example.com', passwordHash: 'x' },
    });
    const entry = await testDb.entry.create({
      data: {
        userId: user.id,
        journalDate: '2026-08-18',
        mood: Mood.RAD,
        note: 'Already full.',
        photos: {
          create: Array.from({ length: 20 }, (_, index) => ({
            drivePath: `photos/existing-${index}.jpg`,
            mimeType: 'image/jpeg',
          })),
        },
      },
    });
    mocks.verifySession.mockResolvedValue({ isAuth: true, userId: user.id });
    const stagedResponse = await stagePhotoUpload(new Request('http://localhost/api/photo-stages', {
      method: 'POST',
      body: form(new File(['photo'], 'photo.jpg', { type: 'image/jpeg' })),
    }));
    const staged = await stagedResponse.json() as { id: string };

    const state = await updateEntry(entry.id, undefined, form(undefined, staged.id));

    expect(state).toEqual({ error: 'Entries can have up to 20 photos.' });
    expect(await testDb.photo.count({ where: { entryId: entry.id } })).toBe(20);
    expect(await testDb.stagedPhoto.count({ where: { id: staged.id } })).toBe(1);
  });

  it('accepts photos whose combined size exceeds 20 MB while editing', async () => {
    const user = await testDb.user.create({
      data: { email: 'size@example.com', passwordHash: 'x' },
    });
    const entry = await testDb.entry.create({
      data: {
        userId: user.id,
        journalDate: '2026-08-18',
        mood: Mood.RAD,
        note: 'Large photos are allowed.',
        photos: {
          create: {
            drivePath: 'photos/large-existing.jpg',
            mimeType: 'image/jpeg',
            sizeBytes: 20 * 1024 * 1024 - 1,
          },
        },
      },
    });
    mocks.verifySession.mockResolvedValue({ isAuth: true, userId: user.id });
    const staged = await testDb.stagedPhoto.create({
      data: {
        userId: user.id,
        draftKey: 'draft-1',
        clientKey: 'client-1',
        drivePath: 'photos/large-staged.jpg',
        driveFileId: 'drive-large-staged',
        mimeType: 'image/jpeg',
        sizeBytes: 1_000_001,
      },
    });

    await expect(updateEntry(entry.id, undefined, form(undefined, staged.id))).rejects.toThrow(NEXT_REDIRECT);
    expect(await testDb.photo.count({ where: { entryId: entry.id } })).toBe(2);
    expect(await testDb.photo.findMany({
      where: { entryId: entry.id },
      orderBy: { createdAt: 'asc' },
      select: { sizeBytes: true },
    })).toEqual([{ sizeBytes: 20 * 1024 * 1024 - 1 }, { sizeBytes: 1_000_001 }]);
    expect(await testDb.stagedPhoto.findUnique({ where: { id: staged.id } })).toBeNull();
  });

  it('attaches staged photos when saving an edit', async () => {
    const user = await testDb.user.create({
      data: { email: 'ken@example.com', passwordHash: 'x' },
    });
    const entry = await testDb.entry.create({
      data: {
        userId: user.id,
        journalDate: '2026-08-18',
        mood: Mood.RAD,
        note: 'Add a photo later.',
        photos: {
          create: {
            drivePath: 'photos/legacy-existing.jpg',
            mimeType: 'image/jpeg',
          },
        },
      },
    });
    mocks.verifySession.mockResolvedValue({ isAuth: true, userId: user.id });
    const stagedResponse = await stagePhotoUpload(new Request('http://localhost/api/photo-stages', {
      method: 'POST',
      body: form(new File(['photo'], 'photo.jpg', { type: 'image/jpeg' })),
    }));
    const staged = await stagedResponse.json() as { id: string };

    await expect(updateEntry(entry.id, undefined, form(undefined, staged.id))).rejects.toThrow(NEXT_REDIRECT);

    const updated = await testDb.entry.findUniqueOrThrow({ where: { id: entry.id }, include: { photos: true } });
    expect(updated.photos).toHaveLength(2);
    expect(await testDb.stagedPhoto.findUnique({ where: { id: staged.id } })).toBeNull();
  });

  it('rejects invalid staged photos before talking to Drive or writing a row', async () => {
    const user = await testDb.user.create({
      data: { email: 'ken@example.com', passwordHash: 'x' },
    });
    mocks.verifySession.mockResolvedValue({ isAuth: true, userId: user.id });

    const response = await stagePhotoUpload(new Request('http://localhost/api/photo-stages', {
      method: 'POST',
      body: form(new File(['not an image'], 'notes.txt', { type: 'text/plain' })),
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'Photos must be JPEG, PNG, HEIC, or HEIF images.',
    });
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(await testDb.stagedPhoto.count()).toBe(0);
  });

  it('removes a staged upload through its draft and client keys', async () => {
    const user = await testDb.user.create({
      data: { email: 'ken@example.com', passwordHash: 'x' },
    });
    mocks.verifySession.mockResolvedValue({ isAuth: true, userId: user.id });
    const stagedResponse = await stagePhotoUpload(new Request('http://localhost/api/photo-stages', {
      method: 'POST',
      body: form(new File(['photo'], 'photo.jpg', { type: 'image/jpeg' })),
    }));
    const staged = await stagedResponse.json() as { id: string };

    const response = await deleteStagedPhotoByKey(new Request(
      'http://localhost/api/photo-stages?draftKey=draft-1&clientKey=client-1',
      { method: 'DELETE' },
    ));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ deleted: true });
    expect(await testDb.stagedPhoto.findUnique({ where: { id: staged.id } })).toBeNull();
  });

  it('deletes an owned entry before best-effort Drive cleanup', async () => {
    const user = await testDb.user.create({
      data: { email: 'ken@example.com', passwordHash: 'x' },
    });
    const entry = await testDb.entry.create({
      data: {
        userId: user.id,
        journalDate: '2026-08-18',
        mood: Mood.RAD,
        note: 'Delete me.',
        photos: { create: { drivePath: 'photos/hash.jpg', mimeType: 'image/jpeg' } },
      },
    });
    mocks.verifySession.mockResolvedValue({ isAuth: true, userId: user.id });

    await expect(deleteEntry(entry.id, undefined, new FormData())).rejects.toThrow(NEXT_REDIRECT);

    expect(mocks.deletePhotoFile).toHaveBeenCalledWith('photos/hash.jpg');
    expect(await testDb.entry.findUnique({ where: { id: entry.id } })).toBeNull();
    expect(await testDb.photo.count()).toBe(0);
  });

  it('deletes an individual owned photo from Drive and the database', async () => {
    const user = await testDb.user.create({
      data: { email: 'ken@example.com', passwordHash: 'x' },
    });
    const entry = await testDb.entry.create({
      data: {
        userId: user.id,
        journalDate: '2026-08-18',
        mood: Mood.RAD,
        note: 'Keep the entry.',
        photos: { create: { drivePath: 'photos/hash.jpg', mimeType: 'image/jpeg' } },
      },
    });
    const photo = await testDb.photo.findFirstOrThrow();
    mocks.verifySession.mockResolvedValue({ isAuth: true, userId: user.id });

    const state = await deletePhoto(photo.id, undefined, new FormData());

    expect(state).toBeUndefined();
    expect(mocks.deletePhotoFile).toHaveBeenCalledWith('photos/hash.jpg');
    expect(await testDb.photo.findUnique({ where: { id: photo.id } })).toBeNull();
    expect(await testDb.entry.findUnique({ where: { id: entry.id } })).not.toBeNull();
    expect(mocks.updateTag).toHaveBeenCalledWith(`journal:${user.id}:entry:${entry.id}`);
  });

  it('keeps the database coherent when Drive deletion fails', async () => {
    const user = await testDb.user.create({
      data: { email: 'ken@example.com', passwordHash: 'x' },
    });
    const entry = await testDb.entry.create({
      data: {
        userId: user.id,
        journalDate: '2026-08-18',
        mood: Mood.RAD,
        note: 'Delete the photo row first.',
        photos: { create: { drivePath: 'photos/hash.jpg', mimeType: 'image/jpeg' } },
      },
    });
    const photo = await testDb.photo.findFirstOrThrow();
    mocks.verifySession.mockResolvedValue({ isAuth: true, userId: user.id });
    mocks.deletePhotoFile.mockRejectedValueOnce(new Error('Drive unavailable'));

    const state = await deletePhoto(photo.id, undefined, new FormData());

    expect(state).toBeUndefined();
    expect(await testDb.photo.findUnique({ where: { id: photo.id } })).toBeNull();
    expect(await testDb.entry.findUnique({ where: { id: entry.id } })).not.toBeNull();
    expect(mocks.updateTag).toHaveBeenCalledWith(`journal:${user.id}:entry:${entry.id}`);
  });

  it('rejects anonymous, invalid-id, and wrong-user photo deletion', async () => {
    mocks.verifySession.mockRejectedValueOnce(new Error(NEXT_REDIRECT));
    await expect(deletePhoto('photo-id', undefined, new FormData())).rejects.toThrow(NEXT_REDIRECT);

    mocks.verifySession.mockResolvedValue({ isAuth: true, userId: 'user-id' });
    expect(await deletePhoto(' ', undefined, new FormData())).toEqual({ error: 'Photo not found.' });

    const otherUser = await testDb.user.create({
      data: { email: 'other@example.com', passwordHash: 'x' },
    });
    const otherEntry = await testDb.entry.create({
      data: {
        userId: otherUser.id,
        journalDate: '2026-08-18',
        mood: Mood.RAD,
        note: 'Private photo.',
        photos: { create: { drivePath: 'photos/private.jpg', mimeType: 'image/jpeg' } },
      },
    });
    const otherPhoto = await testDb.photo.findFirstOrThrow({ where: { entryId: otherEntry.id } });

    expect(await deletePhoto(otherPhoto.id, undefined, new FormData())).toEqual({ error: 'Photo not found.' });
    expect(mocks.deletePhotoFile).not.toHaveBeenCalled();
  });
});
