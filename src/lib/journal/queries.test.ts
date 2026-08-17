import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resetTestDb, testDb } from '@/test/test-db'

const mocks = vi.hoisted(() => ({
  verifySession: vi.fn(),
}))

vi.mock('@/lib/dal', () => ({ verifySession: mocks.verifySession }))
vi.mock('@/lib/db', async () => {
  const { testDb } = await import('@/test/test-db')
  return { db: testDb }
})

import { listActivities } from '@/lib/journal/queries'

describe('journal queries', () => {
  beforeEach(async () => {
    await resetTestDb()
    vi.clearAllMocks()
  })

  it('lists only active activities owned by the current user', async () => {
    const user = await testDb.user.create({
      data: { email: 'ken@example.com', passwordHash: 'x' },
    })
    const otherUser = await testDb.user.create({
      data: { email: 'other@example.com', passwordHash: 'x' },
    })
    await testDb.activity.createMany({
      data: [
        { userId: user.id, name: 'work', emoji: '💻' },
        { userId: user.id, name: 'old', emoji: '🗃️', isArchived: true },
        { userId: otherUser.id, name: 'private', emoji: '🔒' },
      ],
    })
    mocks.verifySession.mockResolvedValue({ isAuth: true, userId: user.id })

    await expect(listActivities()).resolves.toEqual([
      { id: expect.any(String), name: 'work', emoji: '💻' },
    ])
  })
})
