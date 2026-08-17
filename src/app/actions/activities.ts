'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { verifySession } from '@/lib/dal'
import {
  activityIdSchema,
  activitySchema,
} from '@/lib/journal/schemas'

export type ActivityState = { error?: string; success?: string } | undefined

const DUPLICATE_ACTIVITY = 'An activity with that name already exists.'
const SAVE_FAILED = 'Unable to save that activity. Please try again.'

function activityFormData(formData: FormData) {
  return {
    name: formData.get('name'),
    emoji: formData.get('emoji'),
  }
}

async function hasNameConflict(name: string, excludeId?: string): Promise<boolean> {
  const activities = await db.activity.findMany({
    where: { isArchived: false },
    select: { id: true, name: true },
  })
  const normalizedName = name.toLocaleLowerCase()
  return activities.some(
    (activity) =>
      activity.id !== excludeId &&
      activity.name.trim().toLocaleLowerCase() === normalizedName,
  )
}

export async function createActivity(
  _prevState: ActivityState,
  formData: FormData,
): Promise<ActivityState> {
  await verifySession()
  const parsed = activitySchema.safeParse(activityFormData(formData))
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? SAVE_FAILED }
  }
  if (await hasNameConflict(parsed.data.name)) {
    return { error: DUPLICATE_ACTIVITY }
  }

  const lastActivity = await db.activity.findFirst({
    where: { isArchived: false },
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  })
  try {
    await db.activity.create({
      data: {
        ...parsed.data,
        sortOrder: (lastActivity?.sortOrder ?? -1) + 1,
      },
    })
  } catch {
    return { error: SAVE_FAILED }
  }

  revalidatePath('/activities')
  revalidatePath('/timeline/new')
  return { success: 'Activity added.' }
}

export async function updateActivity(
  activityId: string,
  _prevState: ActivityState,
  formData: FormData,
): Promise<ActivityState> {
  await verifySession()
  const parsedId = activityIdSchema.safeParse(activityId)
  const parsed = activitySchema.safeParse(activityFormData(formData))
  if (!parsedId.success || !parsed.success) {
    return { error: parsed.error?.issues[0]?.message ?? 'Invalid activity.' }
  }
  if (await hasNameConflict(parsed.data.name, parsedId.data)) {
    return { error: DUPLICATE_ACTIVITY }
  }

  const activity = await db.activity.findUnique({
    where: { id: parsedId.data, isArchived: false },
    select: { id: true },
  })
  if (!activity) {
    return { error: 'Activity not found.' }
  }

  try {
    await db.activity.update({
      where: { id: activity.id },
      data: parsed.data,
    })
  } catch {
    return { error: SAVE_FAILED }
  }

  revalidatePath('/activities')
  revalidatePath('/timeline/new')
  revalidatePath('/timeline')
  return { success: 'Activity updated.' }
}

export async function deleteActivity(activityId: string): Promise<void> {
  await verifySession()
  const parsedId = activityIdSchema.safeParse(activityId)
  if (!parsedId.success) {
    return
  }

  await db.activity.updateMany({
    where: { id: parsedId.data, isArchived: false },
    data: { isArchived: true },
  })
  revalidatePath('/activities')
  revalidatePath('/timeline/new')
  revalidatePath('/timeline')
}
