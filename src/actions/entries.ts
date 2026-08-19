'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { verifySession } from '@/lib/dal';
import { createEntrySchema, entryIdSchema } from '@/lib/journal/schemas';

export type EntryActionState = { error?: string } | undefined
export type CreateEntryState = EntryActionState
export type UpdateEntryState = EntryActionState
export type DeleteEntryState = EntryActionState

const INVALID_ENTRY = 'Choose a mood and write a note before saving.';
const INVALID_ACTIVITY = 'One or more selected activities no longer exist.';
const SAVE_FAILED = 'Unable to save your entry. Please try again.';
const ENTRY_NOT_FOUND = 'Entry not found.';

export async function createEntry(
  _prevState: CreateEntryState,
  formData: FormData,
): Promise<CreateEntryState> {
  const session = await verifySession();
  const parsed = createEntrySchema.safeParse({
    mood: formData.get('mood'),
    note: formData.get('note'),
    activityIds: formData.getAll('activityId'),
    localOffset: formData.get('localOffset') ?? undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? INVALID_ENTRY };
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

  const now = new Date();
  try {
    await db.entry.create({
      data: {
        userId: session.userId,
        date: now,
        localOffset: parsed.data.localOffset ?? -now.getTimezoneOffset(),
        mood: parsed.data.mood,
        note: parsed.data.note,
        activities: {
          create: activityIds.map((activityId) => ({
            activity: { connect: { id: activityId } },
          })),
        },
      },
    });
  } catch {
    return { error: SAVE_FAILED };
  }

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

  const parsed = createEntrySchema.safeParse({
    mood: formData.get('mood'),
    note: formData.get('note'),
    activityIds: formData.getAll('activityId'),
    localOffset: formData.get('localOffset') ?? undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? INVALID_ENTRY };
  }

  const entry = await db.entry.findFirst({
    where: { id: parsedId.data, userId: session.userId },
    select: { id: true, localOffset: true },
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
    await db.entry.update({
      where: { id: entry.id },
      data: {
        mood: parsed.data.mood,
        note: parsed.data.note,
        localOffset: parsed.data.localOffset ?? entry.localOffset,
        activities: {
          deleteMany: {},
          create: activityIds.map((activityId) => ({
            activity: { connect: { id: activityId } },
          })),
        },
      },
    });
  } catch {
    return { error: SAVE_FAILED };
  }

  revalidatePath('/timeline');
  revalidatePath(`/timeline/${entry.id}`);
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

  try {
    const result = await db.entry.deleteMany({
      where: { id: parsedId.data, userId: session.userId },
    });
    if (result.count !== 1) {
      return { error: ENTRY_NOT_FOUND };
    }
  } catch {
    return { error: 'Unable to delete your entry. Please try again.' };
  }

  revalidatePath('/timeline');
  revalidatePath(`/timeline/${parsedId.data}`);
  redirect('/timeline');
}
