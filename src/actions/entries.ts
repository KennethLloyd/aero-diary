'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { verifySession } from '@/lib/dal';
import type { PrismaClient } from '@/generated/prisma/client';
import type { PhotoStore } from '@/lib/drive/store';
import { getPhotoStore } from '@/lib/drive/server-store';
import { invalidateEntryDetailRead, invalidateJournalReads } from '@/lib/journal/cache';
import {
  createJournalEntry,
  updateJournalEntry,
} from '@/lib/journal/mutations';
import { cleanupExpiredStagedPhotos } from '@/lib/journal/photo-staging';
import { getTodayDateKey, isFutureDateKey } from '@/lib/journal/dates';
import {
  MAX_PHOTO_COUNT,
  MAX_PHOTO_TOTAL_SIZE_BYTES,
  PHOTO_UPLOAD_ERROR,
} from '@/lib/journal/photos';
import {
  createEntrySchema,
  entryIdSchema,
  photoIdSchema,
  photoStagingKeySchema,
  stagedPhotoIdSchema,
  updateEntrySchema,
} from '@/lib/journal/schemas';
export type EntryActionState = { error?: string } | undefined
export type CreateEntryState = EntryActionState
export type UpdateEntryState = EntryActionState
export type DeleteEntryState = EntryActionState
export type DeletePhotoState = EntryActionState

const INVALID_ENTRY = 'Choose a mood and write a note before saving.';
const INVALID_DATE = 'Choose a date on or before today.';
const INVALID_ACTIVITY = 'One or more selected activities no longer exist.';
const SAVE_FAILED = 'Unable to save your entry. Please try again.';
const ENTRY_NOT_FOUND = 'Entry not found.';
const PHOTO_NOT_FOUND = 'Photo not found.';
const PHOTO_DELETE_FAILED = 'Unable to delete your photo. Please try again.';
const PHOTO_CAPACITY_ERROR = 'Entries can have up to 10 photos.';
const PHOTO_SIZE_CAPACITY_ERROR = 'Photos in an entry must be 20 MB or smaller in total.';
class EntryPhotoSizeCapacityError extends Error {}
class EntryPhotoCapacityError extends Error {}
class StagedPhotoUnavailableError extends Error {}

function stagedPhotoSelect() {
  return {
    id: true,
    drivePath: true,
    driveFileId: true,
    mimeType: true,
    sizeBytes: true,
  } as const;
}

async function findStagedPhotos(userId: string, formData: FormData) {
  const rawIds = formData.getAll('stagedPhotoId');
  const parsedIds = rawIds.map((id) => stagedPhotoIdSchema.safeParse(id));
  if (parsedIds.some((parsed) => !parsed.success)) return { error: PHOTO_UPLOAD_ERROR } as const;

  const ids = [...new Set(parsedIds.flatMap((parsed) => parsed.success ? [parsed.data] : []))];
  if (ids.length > MAX_PHOTO_COUNT) return { error: PHOTO_UPLOAD_ERROR } as const;
  if (ids.length === 0) return { data: [], ids } as const;

  const parsedDraftKey = photoStagingKeySchema.safeParse(formData.get('draftKey'));
  if (!parsedDraftKey.success) return { error: PHOTO_UPLOAD_ERROR } as const;
  let photoStore: PhotoStore | undefined;
  try {
    photoStore = getPhotoStore();
  } catch (error) {
    console.error('Photo staging cleanup could not access Drive.', error);
  }
  await cleanupExpiredStagedPhotos(db, photoStore);
  const [photos, cancellations] = await db.$transaction([
    db.stagedPhoto.findMany({
      where: { id: { in: ids }, userId, draftKey: parsedDraftKey.data },
      select: stagedPhotoSelect(),
    }),
    db.stagedPhotoCancellation.findMany({
      where: {
        userId,
        draftKey: parsedDraftKey.data,
        stagedPhotoId: { in: ids },
      },
      select: { stagedPhotoId: true, expired: true },
    }),
  ]);
  const expiredIds = cancellations.flatMap((cancellation) => (
    cancellation.expired && cancellation.stagedPhotoId ? [cancellation.stagedPhotoId] : []
  ));
  if (photos.length + expiredIds.length !== ids.length) return { error: PHOTO_UPLOAD_ERROR } as const;
  return { data: photos, ids: photos.map((photo) => photo.id) } as const;
}

async function cleanupDeletedPhotos(store: PhotoStore | undefined, photos: { driveFileId: string | null; drivePath: string }[]) {
  if (!store || photos.length === 0) return;
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


type StagedPhotoTransaction = Pick<PrismaClient, 'stagedPhoto' | 'stagedPhotoCancellation'>;

async function consumeStagedPhotos<T extends { id: string }>(
  transaction: StagedPhotoTransaction,
  userId: string,
  staged: { ids: readonly string[]; data: readonly T[] },
) {
  if (staged.ids.length === 0) return [...staged.data];
  const consumed = await transaction.stagedPhoto.deleteMany({
    where: { id: { in: [...staged.ids] }, userId },
  });
  if (consumed.count === staged.ids.length) return [...staged.data];

  const expiredCancellations = await transaction.stagedPhotoCancellation.findMany({
    where: {
      userId,
      stagedPhotoId: { in: [...staged.ids] },
      expired: true,
    },
    select: { stagedPhotoId: true },
  });
  const expiredIds = new Set(
    expiredCancellations.flatMap((cancellation) => (
      cancellation.stagedPhotoId ? [cancellation.stagedPhotoId] : []
    )),
  );
  if (expiredIds.size !== staged.ids.length - consumed.count) {
    throw new StagedPhotoUnavailableError();
  }
  return staged.data.filter((photo) => !expiredIds.has(photo.id));
}

export async function createEntry(
  _prevState: CreateEntryState,
  formData: FormData,
): Promise<CreateEntryState> {
  const session = await verifySession();
  const parsed = createEntrySchema.safeParse({
    mood: formData.get('mood'),
    note: formData.get('note'),
    activityIds: formData.getAll('activityId'),
    journalDate: formData.get('journalDate') ?? undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? INVALID_ENTRY };
  }
  const now = new Date();
  const journalDate = parsed.data.journalDate ?? getTodayDateKey(now);
  if (isFutureDateKey(journalDate, now)) {
    return { error: INVALID_DATE };
  }

  const staged = await findStagedPhotos(session.userId, formData);
  if ('error' in staged) return staged;

  const activityIds = [...new Set(parsed.data.activityIds)];
  const activities = await db.activity.findMany({
    where: {
      id: { in: activityIds },
      userId: session.userId,
      isArchived: false,
    },
    select: { id: true },
  });
  if (activities.length !== activityIds.length) {
    return { error: INVALID_ACTIVITY };
  }

  let createdEntryId: string | undefined;
  let photosToAttach = staged.data;
  try {
    const createdEntry = await db.$transaction(async (transaction) => {
      photosToAttach = await consumeStagedPhotos(transaction, session.userId, staged);
      return createJournalEntry(transaction, {
        userId: session.userId,
        journalDate,
        mood: parsed.data.mood,
        note: parsed.data.note,
        activityIds,
        photos: photosToAttach.map((photo) => ({
          drivePath: photo.drivePath,
          fileId: photo.driveFileId,
          mimeType: photo.mimeType,
          sizeBytes: photo.sizeBytes,
        })),
      });
    });
    createdEntryId = createdEntry.id;
  } catch (error) {
    if (error instanceof StagedPhotoUnavailableError) return { error: PHOTO_UPLOAD_ERROR };
    return { error: SAVE_FAILED };
  }

  invalidateJournalReads(session.userId, createdEntryId);
  revalidatePath('/timeline');
  redirect('/timeline');
}

export async function updateEntry(
  entryId: string,
  _prevState: UpdateEntryState,
  formData: FormData,
): Promise<UpdateEntryState> {
  const session = await verifySession();
  const parsedId = entryIdSchema.safeParse(entryId);
  if (!parsedId.success) {
    return { error: ENTRY_NOT_FOUND };
  }

  const parsed = updateEntrySchema.safeParse({
    mood: formData.get('mood'),
    note: formData.get('note'),
    activityIds: formData.getAll('activityId'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? INVALID_ENTRY };
  }

  const staged = await findStagedPhotos(session.userId, formData);
  if ('error' in staged) return staged;

  const entry = await db.entry.findFirst({
    where: { id: parsedId.data, userId: session.userId },
    select: { id: true, photos: { select: { id: true, drivePath: true, sizeBytes: true } } },
  });
  if (!entry) {
    return { error: ENTRY_NOT_FOUND };
  }
  const existingPhotoSizeBytes = staged.ids.length > 0
    ? await getExistingPhotoSizeBytes(entry.photos)
    : 0;

  const activityIds = [...new Set(parsed.data.activityIds)];
  const activities = await db.activity.findMany({
    where: {
      id: { in: activityIds },
      userId: session.userId,
      isArchived: false,
    },
    select: { id: true },
  });
  if (activities.length !== activityIds.length) {
    return { error: INVALID_ACTIVITY };
  }

  let photosToAttach = staged.data;
  try {
    await db.$transaction(async (transaction) => {
      const currentEntry = await transaction.entry.findFirst({
        where: { id: entry.id, userId: session.userId },
        select: { photos: { select: { id: true, sizeBytes: true } } },
      });
      if (!currentEntry) throw new Error('Entry was deleted while it was being edited.');
      photosToAttach = await consumeStagedPhotos(transaction, session.userId, staged);
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
        const attachedPhotoSizeBytes = photosToAttach.reduce((total, photo) => total + photo.sizeBytes, 0);
        const existingSizeBytes = currentEntry.photos.every((photo) => photo.sizeBytes !== null)
          ? currentPhotoSizeBytes
          : existingPhotoSizeBytes;
        if (existingSizeBytes + attachedPhotoSizeBytes > MAX_PHOTO_TOTAL_SIZE_BYTES) {
          throw new EntryPhotoSizeCapacityError();
        }
      }
      await updateJournalEntry(transaction, entry.id, {
        mood: parsed.data.mood,
        note: parsed.data.note,
        activityIds,
        photos: photosToAttach.map((photo) => ({
          drivePath: photo.drivePath,
          fileId: photo.driveFileId,
          mimeType: photo.mimeType,
          sizeBytes: photo.sizeBytes,
        })),
      });
    });
  } catch (error) {
    if (error instanceof EntryPhotoCapacityError) return { error: PHOTO_CAPACITY_ERROR };
    if (error instanceof EntryPhotoSizeCapacityError) return { error: PHOTO_SIZE_CAPACITY_ERROR };
    if (error instanceof StagedPhotoUnavailableError) return { error: PHOTO_UPLOAD_ERROR };
    return { error: SAVE_FAILED };
  }

  invalidateJournalReads(session.userId, entry.id);
  revalidatePath('/timeline');
  revalidatePath(`/timeline/${entry.id}`);
  revalidatePath(`/timeline/${entry.id}/edit`);
  redirect(`/timeline/${entry.id}`);
}

export async function deleteEntry(
  entryId: string,
  _prevState: DeleteEntryState,
  _formData: FormData,
): Promise<DeleteEntryState> {
  void _prevState;
  void _formData;
  const session = await verifySession();
  const parsedId = entryIdSchema.safeParse(entryId);
  if (!parsedId.success) {
    return { error: ENTRY_NOT_FOUND };
  }

  const entry = await db.entry.findFirst({
    where: { id: parsedId.data, userId: session.userId },
    select: { id: true, photos: { select: { driveFileId: true, drivePath: true } } },
  });
  if (!entry) return { error: ENTRY_NOT_FOUND };

  try {
    await db.entry.delete({ where: { id: entry.id } });
  } catch {
    return { error: 'Unable to delete your entry. Please try again.' };
  }

  try {
    await cleanupDeletedPhotos(
      entry.photos.length > 0 ? getPhotoStore() : undefined,
      entry.photos,
    );
  } catch (error) {
    console.error('Entry deletion succeeded but Drive cleanup could not start.', error);
  }

  invalidateJournalReads(session.userId, parsedId.data);
  revalidatePath('/timeline');
  revalidatePath(`/timeline/${parsedId.data}`);
  redirect('/timeline');
}

export async function deletePhoto(
  photoId: string,
  _prevState: DeletePhotoState,
  _formData: FormData,
): Promise<DeletePhotoState> {
  void _prevState;
  void _formData;
  const session = await verifySession();
  const parsedPhotoId = photoIdSchema.safeParse(photoId);
  if (!parsedPhotoId.success) return { error: PHOTO_NOT_FOUND };

  const photo = await db.photo.findFirst({
    where: {
      id: parsedPhotoId.data,
      entry: { userId: session.userId },
    },
    select: { driveFileId: true, drivePath: true, entryId: true },
  });
  if (!photo) return { error: PHOTO_NOT_FOUND };

  try {
    const result = await db.photo.deleteMany({ where: { id: parsedPhotoId.data } });
    if (result.count !== 1) return { error: PHOTO_NOT_FOUND };
  } catch {
    return { error: PHOTO_DELETE_FAILED };
  }

  try {
    await cleanupDeletedPhotos(getPhotoStore(), [photo]);
  } catch (error) {
    console.error('Photo deletion succeeded but Drive cleanup could not start.', error);
  }

  invalidateEntryDetailRead(session.userId, photo.entryId);
  revalidatePath('/timeline');
  revalidatePath(`/timeline/${photo.entryId}`);
}
