import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Mood } from '@/generated/prisma/enums'
import { resetTestDb, testDb } from '@/test/test-db'

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  verifySession: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('@/lib/dal', () => ({ verifySession: mocks.verifySession }))
vi.mock('@/lib/db', async () => {
  const { testDb } = await import('@/test/test-db')
  return { db: testDb }
})

import {
  createActivity,
  deleteActivity,
  updateActivity,
} from '@/app/actions/activities'

function form(name = 'work', emoji = '💻'): FormData {
  const data = new FormData()
  data.set('name', name)
  data.set('emoji', emoji)
  return data
}

describe('activity actions', () => {
  beforeEach(async () => {
    await resetTestDb()
    vi.clearAllMocks()
    mocks.verifySession.mockResolvedValue({ isAuth: true, userId: 'user-1' })
  })

  it('rejects an anonymous create request before validating or writing', async () => {
    mocks.verifySession.mockRejectedValue(new Error('NEXT_REDIRECT'))

    await expect(createActivity(undefined, form())).rejects.toThrow('NEXT_REDIRECT')
    expect(await testDb.activity.count()).toBe(0)
  })

  it('validates activity input', async () => {
    const state = await createActivity(undefined, form('   ', ''))

    expect(state).toEqual({ error: 'Enter an activity name.' })
    expect(await testDb.activity.count()).toBe(0)
  })

  it('creates, renames, and archives activities without removing historical links', async () => {
    const created = await createActivity(undefined, form())
    expect(created).toEqual({ success: 'Activity added.' })

    const activity = await testDb.activity.findFirstOrThrow()
    const updated = await updateActivity(activity.id, undefined, form('focus', '🎯'))
    expect(updated).toEqual({ success: 'Activity updated.' })

    expect(await testDb.activity.findUniqueOrThrow({ where: { id: activity.id } })).toMatchObject({
      name: 'focus',
      emoji: '🎯',
    })

    const user = await testDb.user.create({
      data: { email: 'ken@example.com', passwordHash: 'x' },
    })
    const entry = await testDb.entry.create({
      data: {
        userId: user.id,
        date: new Date(),
        localOffset: 480,
        mood: Mood.GOOD,
        note: 'Historical activity link.',
        activities: { create: [{ activityId: activity.id }] },
      },
    })

    await deleteActivity(activity.id)
    expect(await testDb.activity.findUniqueOrThrow({ where: { id: activity.id } })).toMatchObject({
      isArchived: true,
    })
    expect(await testDb.entryActivity.findUnique({
      where: { entryId_activityId: { entryId: entry.id, activityId: activity.id } },
    })).not.toBeNull()
  })
})
