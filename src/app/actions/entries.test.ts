import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Mood } from '@/generated/prisma/enums'
import { resetTestDb, testDb } from '@/test/test-db'

const mocks = vi.hoisted(() => ({
  redirect: vi.fn(),
  revalidatePath: vi.fn(),
  verifySession: vi.fn(),
}))

vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('@/lib/dal', () => ({ verifySession: mocks.verifySession }))
vi.mock('@/lib/db', async () => {
  const { testDb } = await import('@/test/test-db')
  return { db: testDb }
})

import { createEntry } from '@/app/actions/entries'

const NEXT_REDIRECT = 'NEXT_REDIRECT'

function form({
  mood = Mood.RAD,
  note = 'A good day to write things down.',
  activityId,
}: {
  mood?: string
  note?: string
  activityId?: string
} = {}): FormData {
  const data = new FormData()
  data.set('mood', mood)
  data.set('note', note)
  data.set('localOffset', '480')
  if (activityId) data.append('activityId', activityId)
  return data
}

describe('createEntry action', () => {
  beforeEach(async () => {
    await resetTestDb()
    vi.clearAllMocks()
    mocks.redirect.mockImplementation(() => {
      throw new Error(NEXT_REDIRECT)
    })
  })

  it('rejects an anonymous request before parsing or writing', async () => {
    mocks.verifySession.mockRejectedValue(new Error(NEXT_REDIRECT))

    await expect(createEntry(undefined, form())).rejects.toThrow(NEXT_REDIRECT)
    expect(await testDb.entry.count()).toBe(0)
  })

  it('returns a validation error and does not create an invalid entry', async () => {
    const user = await testDb.user.create({
      data: { email: 'ken@example.com', passwordHash: 'x' },
    })
    mocks.verifySession.mockResolvedValue({ isAuth: true, userId: user.id })

    const state = await createEntry(undefined, form({ mood: 'INVALID', note: '' }))

    expect(state).toEqual({ error: 'Choose a mood.' })
    expect(await testDb.entry.count()).toBe(0)
  })

  it('creates a user-scoped entry and connects selected activities', async () => {
    const user = await testDb.user.create({
      data: { email: 'ken@example.com', passwordHash: 'x' },
    })
    const activity = await testDb.activity.create({
      data: { name: 'work', emoji: '💻' },
    })
    mocks.verifySession.mockResolvedValue({ isAuth: true, userId: user.id })

    await expect(createEntry(undefined, form({ activityId: activity.id }))).rejects.toThrow(
      NEXT_REDIRECT,
    )

    const entry = await testDb.entry.findFirstOrThrow({
      include: { activities: true },
    })
    expect(entry).toMatchObject({ userId: user.id, mood: Mood.RAD, note: 'A good day to write things down.' })
    expect(entry.activities).toEqual([{ entryId: entry.id, activityId: activity.id }])
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/timeline')
  })
})
