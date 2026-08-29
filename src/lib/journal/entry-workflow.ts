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
import {
  MAX_PHOTO_COUNT,
  MAX_PHOTO_TOTAL_SIZE_BYTES,
} from '@/lib/journal/photos';
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
    super('An entry cannot contain more than 10 photos.');
    this.name = 'EntryPhotoCapacityError';
  }
}

export class EntryPhotoSizeCapacityError extends Error {
  constructor() {
    super('Photos in an entry cannot exceed 20 MB in total.');
    this.name = 'EntryPhotoSizeCapacityError';
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

async function getExistingPhotoSizeBytes(
  photos: { drivePath: string; sizeBytes: number | null }[],
) {
  const knownSizeBytes = photos.reduce(
    (total, photo) => total + (photo.sizeBytes ?? 0),
    0,
  );
  const photosWithoutSize = photos.filter((photo) => photo.sizeBytes === null);
  if (photosWithoutSize.length === 0) return knownSizeBytes;

  let store: PhotoStore;
  try {
    store = getPhotoStore();
  } catch (error) {
    console.error('Photo size lookup could not access Drive.', error);
    return null;
  }
  const resolutions = await Promise.allSettled(
    photosWithoutSize.map((photo) => store.resolve(photo.drivePath)),
  );
  const resolvedSizeBytes = resolutions.map((result) => {
    const sizeBytes = (
      result.status === 'fulfilled'
      && result.value.status === 'resolved'
      ? result.value.sizeBytes
      : null
    );
    return sizeBytes !== null && Number.isSafeInteger(sizeBytes) && sizeBytes >= 0
      ? sizeBytes
      : null;
  });
  if (resolvedSizeBytes.some((sizeBytes) => sizeBytes === null)) return null;
  const totalResolvedSizeBytes = resolvedSizeBytes
    .filter((sizeBytes): sizeBytes is number => sizeBytes !== null)
    .reduce((total, sizeBytes) => total + sizeBytes, 0);
  return knownSizeBytes + totalResolvedSizeBytes;
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
      photos: { select: { id: true, drivePath: true, sizeBytes: true } },
      activities: { select: { activityId: true } },
    },
  });
  if (!entry) return null;

  const existingPhotoSizeBytes = staged.ids.length > 0
    ? await getExistingPhotoSizeBytes(entry.photos)
    : 0;
  const activityIds = await ownedActivityIds(
    userId,
    input.activityIds,
    entry.activities.map((activity) => activity.activityId),
  );

  await db.$transaction(async (transaction) => {
    const currentEntry = await transaction.entry.findFirst({
      where: { id: entry.id, userId },
      select: { photos: { select: { id: true, sizeBytes: true } } },
    });
    if (!currentEntry) throw new Error('Entry was deleted while it was being edited.');

    const photosToAttach = await consumeStagedPhotos(transaction, userId, staged);
    if (currentEntry.photos.length + photosToAttach.length > MAX_PHOTO_COUNT) {
      throw new EntryPhotoCapacityError();
    }
    if (photosToAttach.length > 0) {
      const currentPhotoIds = new Set(currentEntry.photos.map((photo) => photo.id));
      const originalPhotoIds = new Set(entry.photos.map((photo) => photo.id));
      const photoSetChanged = currentPhotoIds.size !== originalPhotoIds.size
        || [...currentPhotoIds].some((photoId) => !originalPhotoIds.has(photoId));
      if (photoSetChanged || existingPhotoSizeBytes === null) {
        throw new EntryPhotoSizeCapacityError();
      }

      const currentPhotoSizeBytes = currentEntry.photos.reduce(
        (total, photo) => total + (photo.sizeBytes ?? 0),
        0,
      );
      const attachedPhotoSizeBytes = photosToAttach.reduce(
        (total, photo) => total + photo.sizeBytes,
        0,
      );
      const existingSizeBytes = currentEntry.photos.every((photo) => photo.sizeBytes !== null)
        ? currentPhotoSizeBytes
        : existingPhotoSizeBytes;
      if (existingSizeBytes + attachedPhotoSizeBytes > MAX_PHOTO_TOTAL_SIZE_BYTES) {
        throw new EntryPhotoSizeCapacityError();
      }
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

