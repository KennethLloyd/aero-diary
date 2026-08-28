'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { verifySession } from '@/lib/dal';
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
import { invalidateEntryDetailRead, invalidateJournalReads } from '@/lib/journal/cache';
import { MAX_PHOTO_COUNT, PHOTO_UPLOAD_ERROR } from '@/lib/journal/photos';
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

function entryFields(formData: FormData) {
  return {
    mood: formData.get('mood'),
    note: formData.get('note'),
    activityIds: formData.getAll('activityId'),
    journalDate: formData.get('journalDate') ?? undefined,
  };
}

function updateEntryFields(formData: FormData) {
  const fields = entryFields(formData);
  return {
    mood: fields.mood,
    note: fields.note,
    activityIds: fields.activityIds,
  };
}

function stagedPhotoSelection(formData: FormData) {
  const parsedIds = formData.getAll('stagedPhotoId').map((id) => stagedPhotoIdSchema.safeParse(id));
  if (parsedIds.some((parsed) => !parsed.success)) return { error: PHOTO_UPLOAD_ERROR } as const;

  const ids = [...new Set(parsedIds.flatMap((parsed) => parsed.success ? [parsed.data] : []))];
  if (ids.length > MAX_PHOTO_COUNT) return { error: PHOTO_UPLOAD_ERROR } as const;
  if (ids.length === 0) return { data: { ids } } as const;

  const parsedDraftKey = photoStagingKeySchema.safeParse(formData.get('draftKey'));
  if (!parsedDraftKey.success) return { error: PHOTO_UPLOAD_ERROR } as const;
  return { data: { ids, draftKey: parsedDraftKey.data } } as const;
}

function saveError(error: unknown) {
  if (error instanceof EntryDateInFutureError) return INVALID_DATE;
  if (error instanceof EntryActivityOwnershipError) return INVALID_ACTIVITY;
  if (error instanceof EntryPhotoCapacityError) return PHOTO_CAPACITY_ERROR;
  if (error instanceof EntryPhotoSizeCapacityError) return PHOTO_SIZE_CAPACITY_ERROR;
  if (error instanceof StagedPhotoUnavailableError) return PHOTO_UPLOAD_ERROR;
  return SAVE_FAILED;
}

export async function createEntry(
  _prevState: CreateEntryState,
  formData: FormData,
): Promise<CreateEntryState> {
  const session = await verifySession();
  const parsed = createEntrySchema.safeParse(entryFields(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? INVALID_ENTRY };
  }

  const staged = stagedPhotoSelection(formData);
  if ('error' in staged) return staged;

  let createdEntryId: string;
  try {
    const createdEntry = await createEntryWorkflow(session.userId, parsed.data, staged.data);
    createdEntryId = createdEntry.id;
  } catch (error) {
    return { error: saveError(error) };
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
  if (!parsedId.success) return { error: ENTRY_NOT_FOUND };

  const parsed = updateEntrySchema.safeParse(updateEntryFields(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? INVALID_ENTRY };
  }

  const staged = stagedPhotoSelection(formData);
  if ('error' in staged) return staged;

  let updated: { id: string } | null;
  try {
    updated = await updateEntryWorkflow(session.userId, parsedId.data, parsed.data, staged.data);
  } catch (error) {
    return { error: saveError(error) };
  }
  if (!updated) return { error: ENTRY_NOT_FOUND };

  invalidateJournalReads(session.userId, updated.id);
  revalidatePath('/timeline');
  revalidatePath(`/timeline/${updated.id}`);
  revalidatePath(`/timeline/${updated.id}/edit`);
  redirect(`/timeline/${updated.id}`);
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
  if (!parsedId.success) return { error: ENTRY_NOT_FOUND };

  let deleted: { id: string } | null;
  try {
    deleted = await deleteEntryWorkflow(session.userId, parsedId.data);
  } catch {
    return { error: 'Unable to delete your entry. Please try again.' };
  }
  if (!deleted) return { error: ENTRY_NOT_FOUND };

  invalidateJournalReads(session.userId, deleted.id);
  revalidatePath('/timeline');
  revalidatePath(`/timeline/${deleted.id}`);
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

  let deleted: { entryId: string } | null;
  try {
    deleted = await deletePhotoWorkflow(session.userId, parsedPhotoId.data);
  } catch {
    return { error: PHOTO_DELETE_FAILED };
  }
  if (!deleted) return { error: PHOTO_NOT_FOUND };

  invalidateEntryDetailRead(session.userId, deleted.entryId);
  revalidatePath('/timeline');
  revalidatePath(`/timeline/${deleted.entryId}`);
}
