'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { verifySession } from '@/lib/dal'
import { createEntrySchema } from '@/lib/journal/schemas'

export type CreateEntryState = { error?: string } | undefined

const INVALID_ENTRY = 'Choose a mood and write a note before saving.'
const INVALID_ACTIVITY = 'One or more selected activities no longer exist.'
const SAVE_FAILED = 'Unable to save your entry. Please try again.'

export async function createEntry(
  _prevState: CreateEntryState,
  formData: FormData,
): Promise<CreateEntryState> {
  const session = await verifySession()
  const parsed = createEntrySchema.safeParse({
    mood: formData.get('mood'),
    note: formData.get('note'),
    activityIds: formData.getAll('activityId'),
    localOffset: formData.get('localOffset') ?? undefined,
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? INVALID_ENTRY }
  }

  const activityIds = [...new Set(parsed.data.activityIds)]
  const activities = await db.activity.findMany({
    where: { id: { in: activityIds } },
    select: { id: true },
  })
  if (activities.length !== activityIds.length) {
    return { error: INVALID_ACTIVITY }
  }

  const now = new Date()
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
    })
  } catch {
    return { error: SAVE_FAILED }
  }

  revalidatePath('/timeline')
  redirect('/timeline')
}
