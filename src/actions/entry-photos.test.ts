import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Mood } from '@/generated/prisma/enums';
import { resetTestDb, testDb } from '@/test/test-db';

const mocks = vi.hoisted(() => ({
  deleteById: vi.fn(),
  deletePhotoFile: vi.fn(),
  getPhotoStore: vi.fn(),
  redirect: vi.fn(),
  revalidatePath: vi.fn(),
  upload: vi.fn(),
  verifySession: vi.fn(),
}));

vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('@/lib/dal', () => ({ verifySession: mocks.verifySession }));
vi.mock('@/lib/drive/server-store', () => ({ getPhotoStore: mocks.getPhotoStore }));
vi.mock('@/lib/db', async () => {
  const { testDb } = await import('@/test/test-db');
  return { db: testDb };
});

import { createEntry, deleteEntry, deletePhoto } from '@/actions/entries';

const NEXT_REDIRECT = 'NEXT_REDIRECT';

function form(photo?: File) {
  const data = new FormData();
  data.set('mood', Mood.RAD);
  data.set('note', 'A memory with a photo.');
  data.set('localOffset', '480');
  if (photo) data.append('photo', photo);
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
      upload: mocks.upload,
    });
    mocks.upload.mockResolvedValue({
      drivePath: 'photos/hash.jpg',
      fileId: 'drive-file',
      mimeType: 'image/jpeg',
    });
  });

  it('uploads selected photos and stores their Drive-relative paths', async () => {
    const user = await testDb.user.create({
      data: { email: 'ken@example.com', passwordHash: 'x' },
    });
    mocks.verifySession.mockResolvedValue({ isAuth: true, userId: user.id });
    const photo = new File(['photo'], 'photo.jpg', { type: 'image/jpeg' });

    await expect(createEntry(undefined, form(photo))).rejects.toThrow(NEXT_REDIRECT);

    const entry = await testDb.entry.findFirstOrThrow({ include: { photos: true } });
    expect(entry.photos).toMatchObject([
      { driveFileId: 'drive-file', drivePath: 'photos/hash.jpg', mimeType: 'image/jpeg' },
    ]);
    expect(mocks.upload).toHaveBeenCalledWith(photo);
  });

  it('rejects invalid photos before talking to Drive or writing an entry', async () => {
    const user = await testDb.user.create({
      data: { email: 'ken@example.com', passwordHash: 'x' },
    });
    mocks.verifySession.mockResolvedValue({ isAuth: true, userId: user.id });

    const state = await createEntry(
      undefined,
      form(new File(['not an image'], 'notes.txt', { type: 'text/plain' })),
    );

    expect(state).toEqual({ error: 'Photos must be JPEG, PNG, HEIC, or HEIF images.' });
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(await testDb.entry.count()).toBe(0);
  });

  it('deletes Drive files before deleting an owned entry and its photo rows', async () => {
    const user = await testDb.user.create({
      data: { email: 'ken@example.com', passwordHash: 'x' },
    });
    const entry = await testDb.entry.create({
      data: {
        userId: user.id,
        date: new Date('2026-08-18T10:00:00.000Z'),
        localOffset: 480,
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
        date: new Date('2026-08-18T10:00:00.000Z'),
        localOffset: 480,
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
  });

  it('keeps the photo row when Drive deletion fails', async () => {
    const user = await testDb.user.create({
      data: { email: 'ken@example.com', passwordHash: 'x' },
    });
    const entry = await testDb.entry.create({
      data: {
        userId: user.id,
        date: new Date('2026-08-18T10:00:00.000Z'),
        localOffset: 480,
        mood: Mood.RAD,
        note: 'Keep the photo row.',
        photos: { create: { drivePath: 'photos/hash.jpg', mimeType: 'image/jpeg' } },
      },
    });
    const photo = await testDb.photo.findFirstOrThrow();
    mocks.verifySession.mockResolvedValue({ isAuth: true, userId: user.id });
    mocks.deletePhotoFile.mockRejectedValueOnce(new Error('Drive unavailable'));

    const state = await deletePhoto(photo.id, undefined, new FormData());

    expect(state).toEqual({ error: 'Unable to delete your photo. Please try again.' });
    expect(await testDb.photo.findUnique({ where: { id: photo.id } })).not.toBeNull();
    expect(await testDb.entry.findUnique({ where: { id: entry.id } })).not.toBeNull();
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
        date: new Date('2026-08-18T10:00:00.000Z'),
        localOffset: 480,
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
