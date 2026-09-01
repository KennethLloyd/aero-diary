import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Mood } from '@/generated/prisma/enums';
import { resetTestDb, testDb } from '@/test/test-db';
import type { PhotoStore } from '@/lib/drive/store';
import { MAX_PHOTO_TOTAL_SIZE_BYTES } from '@/lib/journal/photos';
import {
  createEntryWorkflow,
  deleteEntryWorkflow,
  deletePhotoWorkflow,
  EntryActivityOwnershipError,
  EntryDateInFutureError,
  EntryPhotoCapacityError,
  EntryPhotoSizeCapacityError,
  updateEntryWorkflow,
} from '@/lib/journal/entry-workflow';
import { StagedPhotoUnavailableError } from '@/lib/journal/photo-staging';
import { createEntrySchema, updateEntrySchema } from '@/lib/journal/schemas';

const mocks = vi.hoisted(() => ({
  deletePhoto: vi.fn(),
  getPhotoStore: vi.fn(),
  resolve: vi.fn(),
}));

vi.mock('@/lib/db', async () => {
  const { testDb } = await import('@/test/test-db');
  return { db: testDb };
});
vi.mock('@/lib/drive/server-store', () => ({ getPhotoStore: mocks.getPhotoStore }));

function createStore() {
  return {
    delete: mocks.deletePhoto,
    deleteById: vi.fn(),
    download: vi.fn(),
    resolve: mocks.resolve,
    upload: vi.fn(),
  } as unknown as PhotoStore;
}

function createInput(overrides: Record<string, unknown> = {}) {
  return createEntrySchema.parse({
    mood: Mood.RAD,
    note: 'A good day to write things down.',
    activityIds: [],
    ...overrides,
  });
}

function updateInput(overrides: Record<string, unknown> = {}) {
  return updateEntrySchema.parse({
    mood: Mood.RAD,
    note: 'After the edit.',
    activityIds: [],
    ...overrides,
  });
}

async function createUser(email = `${crypto.randomUUID()}@example.com`) {
  return testDb.user.create({
    data: { email, passwordHash: 'x' },
  });
}

async function createStagedPhoto(userId: string, overrides: Record<string, unknown> = {}) {
  return testDb.stagedPhoto.create({
    data: {
      userId,
      draftKey: 'draft-1',
      clientKey: 'client-1',
      drivePath: 'photos/staged.jpg',
      driveFileId: 'drive-staged',
      mimeType: 'image/jpeg',
      sizeBytes: 1,
      ...overrides,
    },
  });
}

describe('entry workflow', () => {
  beforeEach(async () => {
    await resetTestDb();
    vi.clearAllMocks();
    mocks.getPhotoStore.mockReturnValue(createStore());
    mocks.resolve.mockResolvedValue({
      status: 'resolved',
      drivePath: 'photos/existing.jpg',
      fileId: 'drive-existing',
      mimeType: 'image/jpeg',
      sizeBytes: 1,
    });
  });

  it('creates an owned entry from typed input', async () => {
    const user = await createUser('ken@example.com');
    const activity = await testDb.activity.create({
      data: { userId: user.id, name: 'work', emoji: '💻' },
    });

    const created = await createEntryWorkflow(
      user.id,
      createInput({ activityIds: [activity.id], journalDate: '2026-08-28' }),
      { ids: [] },
    );
    const saved = await testDb.entry.findUniqueOrThrow({
      where: { id: created.id },
      include: { activities: true },
    });

    expect(saved.userId).toBe(user.id);
    expect(saved.activities).toEqual([{ entryId: created.id, activityId: activity.id }]);
    expect(saved.activityInferencePending).toBe(true);
  });
  it('preserves an archived activity already attached during an edit', async () => {
    const user = await createUser('archived-edit@example.com');
    const activity = await testDb.activity.create({
      data: { userId: user.id, name: 'Old activity', emoji: '🗃️', isArchived: true },
    });
    const entry = await testDb.entry.create({
      data: {
        userId: user.id,
        journalDate: '2026-08-18',
        mood: Mood.GOOD,
        activityInferencePending: true,
        note: 'Keep this historical tag.',
        activities: { create: [{ activityId: activity.id }] },
      },
    });

    await expect(updateEntryWorkflow(
      user.id,
      entry.id,
      updateInput({ activityIds: [activity.id] }),
      { ids: [] },
    )).resolves.toEqual({ id: entry.id });

    await expect(testDb.entryActivity.findMany()).resolves.toEqual([
      { entryId: entry.id, activityId: activity.id },
    ]);
    await expect(testDb.entry.findUnique({ where: { id: entry.id } })).resolves.toMatchObject({
      activityInferencePending: false,
    });
  });

  it('rejects a future journal date before writing', async () => {
    const user = await createUser();

    await expect(createEntryWorkflow(
      user.id,
      createInput({ journalDate: '2999-01-01' }),
      { ids: [] },
    )).rejects.toBeInstanceOf(EntryDateInFutureError);
    expect(await testDb.entry.count()).toBe(0);
  });

  it('rejects an activity owned by another user', async () => {
    const user = await createUser('ken@example.com');
    const otherUser = await createUser('other@example.com');
    const activity = await testDb.activity.create({
      data: { userId: otherUser.id, name: 'private', emoji: '🔒' },
    });

    await expect(createEntryWorkflow(
      user.id,
      createInput({ activityIds: [activity.id] }),
      { ids: [] },
    )).rejects.toBeInstanceOf(EntryActivityOwnershipError);
    expect(await testDb.entry.count()).toBe(0);
  });

  it('saves text when an attached stage has expired', async () => {
    const user = await createUser('expired@example.com');
    const expired = await createStagedPhoto(user.id, {
      clientKey: 'expired',
      drivePath: 'photos/expired.jpg',
      driveFileId: 'drive-expired',
      createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
    });

    const created = await createEntryWorkflow(
      user.id,
      createInput(),
      { draftKey: 'draft-1', ids: [expired.id] },
    );

    expect(created.note).toBe('A good day to write things down.');
    expect(await testDb.photo.count()).toBe(0);
    expect(await testDb.stagedPhoto.findUnique({ where: { id: expired.id } })).toBeNull();
  });

  it('does not create a duplicate attachment when the save is retried', async () => {
    const user = await createUser('retry@example.com');
    const staged = await createStagedPhoto(user.id);
    const selection = { draftKey: staged.draftKey, ids: [staged.id] };

    await createEntryWorkflow(user.id, createInput(), selection);

    await expect(createEntryWorkflow(user.id, createInput(), selection))
      .rejects.toBeInstanceOf(StagedPhotoUnavailableError);
    expect(await testDb.entry.count({ where: { userId: user.id } })).toBe(1);
    expect(await testDb.photo.count()).toBe(1);
  });

  it('does not attach an eleventh photo while editing a full entry', async () => {
    const user = await createUser('full@example.com');
    const entry = await testDb.entry.create({
      data: {
        userId: user.id,
        journalDate: '2026-08-18',
        mood: Mood.RAD,
        note: 'Already full.',
        photos: {
          create: Array.from({ length: 10 }, (_, index) => ({
            drivePath: `photos/existing-${index}.jpg`,
            mimeType: 'image/jpeg',
          })),
        },
      },
    });
    const staged = await createStagedPhoto(user.id);

    await expect(updateEntryWorkflow(
      user.id,
      entry.id,
      updateInput(),
      { draftKey: staged.draftKey, ids: [staged.id] },
    )).rejects.toBeInstanceOf(EntryPhotoCapacityError);
    expect(await testDb.photo.count({ where: { entryId: entry.id } })).toBe(10);
    expect(await testDb.stagedPhoto.findUnique({ where: { id: staged.id } })).not.toBeNull();
  });

  it('enforces the combined 20 MB photo limit while editing', async () => {
    const user = await createUser('size@example.com');
    const entry = await testDb.entry.create({
      data: {
        userId: user.id,
        journalDate: '2026-08-18',
        mood: Mood.RAD,
        note: 'Size limit.',
        photos: {
          create: {
            drivePath: 'photos/large-existing.jpg',
            mimeType: 'image/jpeg',
            sizeBytes: MAX_PHOTO_TOTAL_SIZE_BYTES - 1_000_000,
          },
        },
      },
    });
    const staged = await createStagedPhoto(user.id, { sizeBytes: 1_000_001 });

    await expect(updateEntryWorkflow(
      user.id,
      entry.id,
      updateInput(),
      { draftKey: staged.draftKey, ids: [staged.id] },
    )).rejects.toBeInstanceOf(EntryPhotoSizeCapacityError);
    expect(await testDb.photo.count({ where: { entryId: entry.id } })).toBe(1);
    expect(await testDb.stagedPhoto.findUnique({ where: { id: staged.id } })).not.toBeNull();
  });

  it('attaches staged photos when saving an edit', async () => {
    const user = await createUser('edit@example.com');
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
    const staged = await createStagedPhoto(user.id);

    await updateEntryWorkflow(
      user.id,
      entry.id,
      updateInput(),
      { draftKey: staged.draftKey, ids: [staged.id] },
    );

    expect(await testDb.photo.count({ where: { entryId: entry.id } })).toBe(2);
    expect(await testDb.stagedPhoto.findUnique({ where: { id: staged.id } })).toBeNull();
  });

  it('deletes an owned entry before best-effort Drive cleanup', async () => {
    const user = await createUser('delete-entry@example.com');
    const entry = await testDb.entry.create({
      data: {
        userId: user.id,
        journalDate: '2026-08-18',
        mood: Mood.RAD,
        note: 'Delete me.',
        photos: { create: { drivePath: 'photos/hash.jpg', mimeType: 'image/jpeg' } },
      },
    });

    await expect(deleteEntryWorkflow(user.id, entry.id)).resolves.toEqual({ id: entry.id });

    expect(mocks.deletePhoto).toHaveBeenCalledWith('photos/hash.jpg');
    expect(await testDb.entry.findUnique({ where: { id: entry.id } })).toBeNull();
  });

  it('keeps the database coherent when Drive deletion fails', async () => {
    const user = await createUser('delete-failure@example.com');
    const entry = await testDb.entry.create({
      data: {
        userId: user.id,
        journalDate: '2026-08-18',
        mood: Mood.RAD,
        note: 'Delete the photo row first.',
        photos: { create: { drivePath: 'photos/hash.jpg', mimeType: 'image/jpeg' } },
      },
    });
    mocks.deletePhoto.mockRejectedValueOnce(new Error('Drive unavailable'));

    await expect(deleteEntryWorkflow(user.id, entry.id)).resolves.toEqual({ id: entry.id });

    expect(await testDb.entry.findUnique({ where: { id: entry.id } })).toBeNull();
    expect(await testDb.photo.count()).toBe(0);
  });

  it('deletes an individual owned photo from Drive and the database', async () => {
    const user = await createUser('delete-photo@example.com');
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

    await expect(deletePhotoWorkflow(user.id, photo.id)).resolves.toEqual({ entryId: entry.id });

    expect(mocks.deletePhoto).toHaveBeenCalledWith('photos/hash.jpg');
    expect(await testDb.photo.findUnique({ where: { id: photo.id } })).toBeNull();
    expect(await testDb.entry.findUnique({ where: { id: entry.id } })).not.toBeNull();
  });

  it('returns not found for entries and photos owned by another user', async () => {
    const user = await createUser('owner@example.com');
    const otherUser = await createUser('other-owner@example.com');
    const entry = await testDb.entry.create({
      data: {
        userId: otherUser.id,
        journalDate: '2026-08-18',
        mood: Mood.RAD,
        note: 'Private.',
        photos: { create: { drivePath: 'photos/private.jpg', mimeType: 'image/jpeg' } },
      },
    });
    const photo = await testDb.photo.findFirstOrThrow();

    await expect(deleteEntryWorkflow(user.id, entry.id)).resolves.toBeNull();
    await expect(deletePhotoWorkflow(user.id, photo.id)).resolves.toBeNull();
    expect(mocks.deletePhoto).not.toHaveBeenCalled();
  });
});
