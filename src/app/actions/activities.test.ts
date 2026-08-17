import { beforeEach, describe, expect, it, vi } from 'vitest'
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

  it('creates, renames, and deletes activities', async () => {
    const created = await createActivity(undefined, form())
    expect(created).toEqual({ success: 'Activity added.' })

    const activity = await testDb.activity.findFirstOrThrow()
    const updated = await updateActivity(activity.id, undefined, form('focus', '🎯'))
    expect(updated).toEqual({ success: 'Activity updated.' })

    expect(await testDb.activity.findUniqueOrThrow({ where: { id: activity.id } })).toMatchObject({
      name: 'focus',
      emoji: '🎯',
    })

    await deleteActivity(activity.id)
    expect(await testDb.activity.count()).toBe(0)
  })
})
