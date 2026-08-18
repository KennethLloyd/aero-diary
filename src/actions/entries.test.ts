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

import { createEntry, deleteEntry, updateEntry } from '@/actions/entries'

const NEXT_REDIRECT = 'NEXT_REDIRECT'

function form({
  mood = Mood.RAD,
  note = 'A good day to write things down.',
  activityId,
  localOffset = '480',
}: {
  mood?: string
  note?: string
  activityId?: string
  localOffset?: string
} = {}): FormData {
  const data = new FormData()
  data.set('mood', mood)
  data.set('note', note)
  data.set('localOffset', localOffset)
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
      data: { userId: user.id, name: 'work', emoji: '💻' },
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

  it('rejects an activity owned by another user', async () => {
    const user = await testDb.user.create({
      data: { email: 'ken@example.com', passwordHash: 'x' },
    })
    const otherUser = await testDb.user.create({
      data: { email: 'other@example.com', passwordHash: 'x' },
    })
    const activity = await testDb.activity.create({
      data: { userId: otherUser.id, name: 'private', emoji: '🔒' },
    })
    mocks.verifySession.mockResolvedValue({ isAuth: true, userId: user.id })

    const state = await createEntry(undefined, form({ activityId: activity.id }))

    expect(state).toEqual({ error: 'One or more selected activities no longer exist.' })
    expect(await testDb.entry.count()).toBe(0)
  })
})

describe('updateEntry action', () => {
  beforeEach(async () => {
    await resetTestDb()
    vi.clearAllMocks()
    mocks.redirect.mockImplementation(() => {
      throw new Error(NEXT_REDIRECT)
    })
  })

  it('updates an owned entry and replaces its activity links', async () => {
    const user = await testDb.user.create({
      data: { email: 'ken@example.com', passwordHash: 'x' },
    })
    const oldActivity = await testDb.activity.create({
      data: { userId: user.id, name: 'old', emoji: '🧹' },
    })
    const newActivity = await testDb.activity.create({
      data: { userId: user.id, name: 'trail', emoji: '🌲' },
    })
    const entry = await testDb.entry.create({
      data: {
        userId: user.id,
        date: new Date('2026-08-18T10:00:00.000Z'),
        localOffset: 480,
        mood: Mood.BAD,
        note: 'Before the edit.',
        activities: { create: [{ activityId: oldActivity.id }] },
      },
    })
    mocks.verifySession.mockResolvedValue({ isAuth: true, userId: user.id })

    await expect(
      updateEntry(entry.id, undefined, form({ mood: Mood.GOOD, note: 'After the edit.', activityId: newActivity.id })),
    ).rejects.toThrow(NEXT_REDIRECT)

    const updated = await testDb.entry.findUniqueOrThrow({
      where: { id: entry.id },
      include: { activities: true },
    })
    expect(updated).toMatchObject({ mood: Mood.GOOD, note: 'After the edit.' })
    expect(updated.activities).toEqual([{ entryId: entry.id, activityId: newActivity.id }])
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/timeline')
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/timeline/${entry.id}`)
    expect(mocks.redirect).toHaveBeenCalledWith(`/timeline/${entry.id}`)
  })

  it('rejects an anonymous request before parsing or writing', async () => {
    mocks.verifySession.mockRejectedValue(new Error(NEXT_REDIRECT))

    await expect(updateEntry('entry-id', undefined, form())).rejects.toThrow(NEXT_REDIRECT)
  })

  it('returns a validation error for invalid update input', async () => {
    const user = await testDb.user.create({
      data: { email: 'ken@example.com', passwordHash: 'x' },
    })
    mocks.verifySession.mockResolvedValue({ isAuth: true, userId: user.id })

    const state = await updateEntry('entry-id', undefined, form({ mood: 'INVALID' }))

    expect(state).toEqual({ error: 'Choose a mood.' })
  })

  it('does not update an entry owned by another user', async () => {
    const user = await testDb.user.create({
      data: { email: 'ken@example.com', passwordHash: 'x' },
    })
    const otherUser = await testDb.user.create({
      data: { email: 'other@example.com', passwordHash: 'x' },
    })
    const entry = await testDb.entry.create({
      data: {
        userId: otherUser.id,
        date: new Date('2026-08-18T10:00:00.000Z'),
        localOffset: 480,
        mood: Mood.BAD,
        note: 'Private note.',
      },
    })
    mocks.verifySession.mockResolvedValue({ isAuth: true, userId: user.id })

    const state = await updateEntry(entry.id, undefined, form({ note: 'Should not change.' }))

    expect(state).toEqual({ error: 'Entry not found.' })
    await expect(testDb.entry.findUniqueOrThrow({ where: { id: entry.id } })).resolves.toMatchObject({
      mood: Mood.BAD,
      note: 'Private note.',
    })
  })
})

describe('deleteEntry action', () => {
  beforeEach(async () => {
    await resetTestDb()
    vi.clearAllMocks()
    mocks.redirect.mockImplementation(() => {
      throw new Error(NEXT_REDIRECT)
    })
  })

  it('deletes an owned entry and its activity links', async () => {
    const user = await testDb.user.create({
      data: { email: 'ken@example.com', passwordHash: 'x' },
    })
    const activity = await testDb.activity.create({
      data: { userId: user.id, name: 'trail', emoji: '🌲' },
    })
    const entry = await testDb.entry.create({
      data: {
        userId: user.id,
        date: new Date('2026-08-18T10:00:00.000Z'),
        localOffset: 480,
        mood: Mood.RAD,
        note: 'Delete me.',
        activities: { create: [{ activityId: activity.id }] },
      },
    })
    mocks.verifySession.mockResolvedValue({ isAuth: true, userId: user.id })

    await expect(deleteEntry(entry.id, undefined, new FormData())).rejects.toThrow(NEXT_REDIRECT)

    expect(await testDb.entry.findUnique({ where: { id: entry.id } })).toBeNull()
    expect(await testDb.entryActivity.count()).toBe(0)
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/timeline')
    expect(mocks.redirect).toHaveBeenCalledWith('/timeline')
  })

  it('rejects an anonymous request before parsing or deleting', async () => {
    mocks.verifySession.mockRejectedValue(new Error(NEXT_REDIRECT))

    await expect(deleteEntry('entry-id', undefined, new FormData())).rejects.toThrow(NEXT_REDIRECT)
  })

  it('returns a validation error for an invalid entry id', async () => {
    const user = await testDb.user.create({
      data: { email: 'ken@example.com', passwordHash: 'x' },
    })
    mocks.verifySession.mockResolvedValue({ isAuth: true, userId: user.id })

    const state = await deleteEntry(' ', undefined, new FormData())

    expect(state).toEqual({ error: 'Entry not found.' })
  })

  it('does not delete an entry owned by another user', async () => {
    const user = await testDb.user.create({
      data: { email: 'ken@example.com', passwordHash: 'x' },
    })
    const otherUser = await testDb.user.create({
      data: { email: 'other@example.com', passwordHash: 'x' },
    })
    const entry = await testDb.entry.create({
      data: {
        userId: otherUser.id,
        date: new Date('2026-08-18T10:00:00.000Z'),
        localOffset: 480,
        mood: Mood.RAD,
        note: 'Keep me.',
      },
    })
    mocks.verifySession.mockResolvedValue({ isAuth: true, userId: user.id })

    const state = await deleteEntry(entry.id, undefined, new FormData())

    expect(state).toEqual({ error: 'Entry not found.' })
    expect(await testDb.entry.findUnique({ where: { id: entry.id } })).not.toBeNull()
  })
})
