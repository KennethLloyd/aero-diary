import 'server-only';

import { db } from '@/lib/db';
import { getPhotoStore } from '@/lib/drive/server-store';
import type { PhotoStore } from '@/lib/drive/store';
import { getTodayDateKey, isFutureDateKey } from '@/lib/journal/dates';
import {
  consumeStagedPhotos,
  loadStagedPhotos,
  type StagedPhotoSelection,
} from '@/lib/journal/photo-staging';
import { MAX_PHOTO_COUNT } from '@/lib/journal/photos';
import {
  createJournalEntry,
  updateJournalEntry,
} from '@/lib/journal/mutations';
import type { CreateEntryInput, UpdateEntryInput } from '@/lib/journal/schemas';

export type EntryPhotoSelection = StagedPhotoSelection

export class EntryDateInFutureError extends Error {
  constructor() {
    super('Journal entries cannot be dated in the future.');
    this.name = 'EntryDateInFutureError';
  }
}

export class EntryActivityOwnershipError extends Error {
  constructor() {
    super('One or more selected activities are unavailable.');
    this.name = 'EntryActivityOwnershipError';
  }
}

export class EntryPhotoCapacityError extends Error {
  constructor() {
    super('An entry cannot contain more than 20 photos.');
    this.name = 'EntryPhotoCapacityError';
  }
}

type EntryPhoto = {
  drivePath: string
  driveFileId: string | null
  mimeType: string
  sizeBytes: number | null
}

export type CreatedEntry = {
  id: string
  note: string
  updatedAt: Date
}

function photoWrites(photos: readonly EntryPhoto[]) {
  return photos.map((photo) => ({
    drivePath: photo.drivePath,
    fileId: photo.driveFileId,
    mimeType: photo.mimeType,
    sizeBytes: photo.sizeBytes,
  }));
}
type EntryContentInput = Pick<CreateEntryInput, 'mood' | 'note'>

function entryMutationInput(
  input: EntryContentInput,
  activityIds: string[],
  photos: readonly EntryPhoto[],
) {
  return {
    mood: input.mood,
    note: input.note,
    activityIds,
    photos: photoWrites(photos),
  };
}

async function stagedPhotosFor(
  userId: string,
  selection: EntryPhotoSelection,
) {
  if (selection.ids.length === 0) return { ids: [], data: [] };

  let store: PhotoStore | undefined;
  try {
    store = getPhotoStore();
  } catch (error) {
    console.error('Photo staging cleanup could not access Drive.', error);
  }
  return loadStagedPhotos(db, store, userId, selection);
}

async function ownedActivityIds(
  userId: string,
  activityIds: readonly string[],
  allowedArchivedActivityIds: readonly string[] = [],
) {
  const ids = [...new Set(activityIds)];
  if (ids.length === 0) return [];

  const allowedArchivedIds = new Set(allowedArchivedActivityIds);
  const activities = await db.activity.findMany({
    where: {
      id: { in: ids },
      userId,
      OR: [
        { isArchived: false },
        { isArchived: true, id: { in: [...allowedArchivedIds] } },
      ],
    },
    select: { id: true },
  });
  if (activities.length !== ids.length) throw new EntryActivityOwnershipError();
  return ids;
}

async function cleanupDeletedPhotos(
  photos: { driveFileId: string | null; drivePath: string }[],
) {
  if (photos.length === 0) return;

  let store: PhotoStore;
  try {
    store = getPhotoStore();
  } catch (error) {
    console.error('Database photo deletion succeeded but Drive cleanup could not start.', error);
    return;
  }
  const results = await Promise.allSettled(photos.map((photo) => (
    photo.driveFileId
      ? store.delete(photo.drivePath, photo.driveFileId)
      : store.delete(photo.drivePath)
  )));
  results.forEach((result) => {
    if (result.status === 'rejected') {
      console.error('Database photo deletion succeeded but Drive cleanup failed.', result.reason);
    }
  });
}

function journalDateFor(input: CreateEntryInput) {
  const now = new Date();
  const journalDate = input.journalDate ?? getTodayDateKey(now);
  if (isFutureDateKey(journalDate, now)) throw new EntryDateInFutureError();
  return journalDate;
}

export async function createEntryWorkflow(
  userId: string,
  input: CreateEntryInput,
  selection: EntryPhotoSelection,
): Promise<CreatedEntry> {
  const journalDate = journalDateFor(input);
  const staged = await stagedPhotosFor(userId, selection);
  const activityIds = await ownedActivityIds(userId, input.activityIds);

  return db.$transaction(async (transaction) => {
    const photosToAttach = await consumeStagedPhotos(transaction, userId, staged);
    return createJournalEntry(transaction, {
      userId,
      journalDate,
      ...entryMutationInput(input, activityIds, photosToAttach),
    });
  });
}

export async function updateEntryWorkflow(
  userId: string,
  entryId: string,
  input: UpdateEntryInput,
  selection: EntryPhotoSelection,
) {
  const staged = await stagedPhotosFor(userId, selection);
  const entry = await db.entry.findFirst({
    where: { id: entryId, userId },
    select: {
      id: true,
      activities: { select: { activityId: true } },
    },
  });
  if (!entry) return null;

  const activityIds = await ownedActivityIds(
    userId,
    input.activityIds,
    entry.activities.map((activity) => activity.activityId),
  );

  await db.$transaction(async (transaction) => {
    const currentEntry = await transaction.entry.findFirst({
      where: { id: entry.id, userId },
      select: { photos: { select: { id: true } } },
    });
    if (!currentEntry) throw new Error('Entry was deleted while it was being edited.');

    const photosToAttach = await consumeStagedPhotos(transaction, userId, staged);
    if (currentEntry.photos.length + photosToAttach.length > MAX_PHOTO_COUNT) {
      throw new EntryPhotoCapacityError();
    }

    await updateJournalEntry(
      transaction,
      entry.id,
      entryMutationInput(input, activityIds, photosToAttach),
    );
  });

  return { id: entry.id };
}

export async function deleteEntryWorkflow(userId: string, entryId: string) {
  const entry = await db.entry.findFirst({
    where: { id: entryId, userId },
    select: { id: true, photos: { select: { driveFileId: true, drivePath: true } } },
  });
  if (!entry) return null;

  await db.entry.delete({ where: { id: entry.id } });
  await cleanupDeletedPhotos(entry.photos);
  return { id: entry.id };
}

export async function deletePhotoWorkflow(userId: string, photoId: string) {
  const photo = await db.photo.findFirst({
    where: {
      id: photoId,
      entry: { userId },
    },
    select: { driveFileId: true, drivePath: true, entryId: true },
  });
  if (!photo) return null;

  const result = await db.photo.deleteMany({ where: { id: photoId } });
  if (result.count !== 1) return null;

  await cleanupDeletedPhotos([photo]);
  return { entryId: photo.entryId };
}
