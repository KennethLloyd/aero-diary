'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { verifySession } from '@/lib/dal';
import { getPhotoStore } from '@/lib/drive/server-store';
import type { PhotoStore, UploadedPhoto } from '@/lib/drive/store';
import { parsePhotoFiles, PHOTO_UPLOAD_ERROR } from '@/lib/journal/photos';
import { invalidateEntryDetailRead, invalidateJournalReads } from '@/lib/journal/cache';
import {
  createJournalEntry,
  updateJournalEntry,
} from '@/lib/journal/mutations';
import { getTodayDateKey, isFutureDateKey } from '@/lib/journal/dates';
import { createEntrySchema, entryIdSchema, photoIdSchema, updateEntrySchema } from '@/lib/journal/schemas';
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


async function cleanupUploadedPhotos(store: PhotoStore | undefined, photos: UploadedPhoto[]) {
  if (!store || photos.length === 0) return;
  await Promise.allSettled(photos.map((photo) => store.deleteById(photo.fileId)));
}

async function saveWithPhotos<T>(
  files: File[],
  persist: (photos: UploadedPhoto[]) => Promise<T>,
): Promise<T> {
  let store: PhotoStore | undefined;
  const photos: UploadedPhoto[] = [];
  try {
    if (files.length > 0) {
      store = getPhotoStore();
      for (const file of files) {
        photos.push(await store.upload(file));
      }
    }
    return await persist(photos);
  } catch (error) {
    await cleanupUploadedPhotos(store, photos);
    throw error;
  }
}

async function deleteStoredPhoto(
  store: PhotoStore,
  photo: { driveFileId: string | null; drivePath: string },
) {
  if (photo.driveFileId) {
    await store.delete(photo.drivePath, photo.driveFileId);
  } else {
    await store.delete(photo.drivePath);
  }
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

  const parsedPhotos = parsePhotoFiles(formData.getAll('photo'));
  if ('error' in parsedPhotos) return { error: parsedPhotos.error };

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
  try {
    const createdEntry = await saveWithPhotos(
      parsedPhotos.data,
      (uploadedPhotos) => createJournalEntry(db, {
        userId: session.userId,
        journalDate,
        mood: parsed.data.mood,
        note: parsed.data.note,
        activityIds,
        photos: uploadedPhotos,
      }),
    );
    createdEntryId = createdEntry.id;
  } catch {
    return { error: parsedPhotos.data.length > 0 ? PHOTO_UPLOAD_ERROR : SAVE_FAILED };
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

  const parsedPhotos = parsePhotoFiles(formData.getAll('photo'));
  if ('error' in parsedPhotos) return { error: parsedPhotos.error };

  const entry = await db.entry.findFirst({
    where: { id: parsedId.data, userId: session.userId },
    select: { id: true },
  });
  if (!entry) {
    return { error: ENTRY_NOT_FOUND };
  }

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

  try {
    await saveWithPhotos(
      parsedPhotos.data,
      (uploadedPhotos) => updateJournalEntry(db, entry.id, {
        mood: parsed.data.mood,
        note: parsed.data.note,
        activityIds,
        photos: uploadedPhotos,
      }),
    );
  } catch {
    return { error: parsedPhotos.data.length > 0 ? PHOTO_UPLOAD_ERROR : SAVE_FAILED };
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
    const store = entry.photos.length > 0 ? getPhotoStore() : undefined;
    await db.$transaction(async (transaction) => {
      await transaction.entry.delete({ where: { id: entry.id } });
      if (store) {
        await Promise.all(entry.photos.map((photo) => deleteStoredPhoto(store, photo)));
      }
    });
  } catch {
    return { error: 'Unable to delete your entry. Please try again.' };
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
    const store = getPhotoStore();
    await db.$transaction(async (transaction) => {
      const result = await transaction.photo.deleteMany({ where: { id: parsedPhotoId.data } });
      if (result.count !== 1) throw new Error('Photo was already deleted.');
      await deleteStoredPhoto(store, photo);
    });
  } catch {
    return { error: PHOTO_DELETE_FAILED };
  }

  invalidateEntryDetailRead(session.userId, photo.entryId);
  revalidatePath('/timeline');
  revalidatePath(`/timeline/${photo.entryId}`);
}
