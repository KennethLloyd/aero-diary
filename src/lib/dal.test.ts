import { beforeEach, describe, expect, it, vi } from 'vitest'
import { testDb, resetTestDb } from '@/test/test-db'
import { hashToken } from '@/lib/auth/session'

const mocks = vi.hoisted(() => {
  const cookieStore = { get: vi.fn(), set: vi.fn(), delete: vi.fn() }
  const redirect = vi.fn()
  return { cookieStore, redirect }
})

vi.mock('next/headers', () => ({ cookies: () => mocks.cookieStore }))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))
vi.mock('@/lib/db', async () => {
  const { testDb } = await import('@/test/test-db')
  return { db: testDb }
})

import { verifySession } from '@/lib/dal'

// `redirect()` throws in Next; the mock throws a sentinel so the gate stops.
const NEXT_REDIRECT = 'NEXT_REDIRECT'

describe('verifySession (auth gate)', () => {
  beforeEach(async () => {
    await resetTestDb()
    vi.clearAllMocks()
    mocks.redirect.mockImplementation(() => {
      throw new Error(NEXT_REDIRECT)
    })
  })

  it('redirects to / when there is no session cookie (anonymous)', async () => {
    mocks.cookieStore.get.mockReturnValue(undefined)
    await expect(verifySession()).rejects.toThrow(NEXT_REDIRECT)
    expect(mocks.redirect).toHaveBeenCalledWith('/')
  })

  it('redirects to / when the token is unknown', async () => {
    mocks.cookieStore.get.mockReturnValue({ value: 'unknown-token' })
    await expect(verifySession()).rejects.toThrow(NEXT_REDIRECT)
    expect(mocks.redirect).toHaveBeenCalledWith('/')
  })

  it('deletes an expired session row and redirects', async () => {
    const user = await testDb.user.create({
      data: { email: 'ken@example.com', passwordHash: 'x' },
    })
    const token = 'expired-token'
    await testDb.session.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() - 1000),
      },
    })
    mocks.cookieStore.get.mockReturnValue({ value: token })
    await expect(verifySession()).rejects.toThrow(NEXT_REDIRECT)
    expect(mocks.redirect).toHaveBeenCalledWith('/')
    expect(await testDb.session.count()).toBe(0)
  })

  it('returns the userId for a valid session', async () => {
    const user = await testDb.user.create({
      data: { email: 'ken@example.com', passwordHash: 'x' },
    })
    const token = 'valid-token'
    await testDb.session.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + 100_000),
      },
    })
    mocks.cookieStore.get.mockReturnValue({ value: token })
    await expect(verifySession()).resolves.toEqual({
      isAuth: true,
      userId: user.id,
    })
  })

  it('renews a session past the halfway point (sliding expiry)', async () => {
    const user = await testDb.user.create({
      data: { email: 'ken@example.com', passwordHash: 'x' },
    })
    const token = 'renew-token'
    // 10 days left — past the 15-day halfway threshold of a 30-day TTL.
    const oldExpiry = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000)
    await testDb.session.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: oldExpiry,
      },
    })
    mocks.cookieStore.get.mockReturnValue({ value: token })

    await verifySession()

    const session = await testDb.session.findUnique({
      where: { tokenHash: hashToken(token) },
    })
    expect(session!.expiresAt.getTime()).toBeGreaterThan(oldExpiry.getTime())
    // Cookie re-set with the same raw token and the new expiry.
    expect(mocks.cookieStore.set).toHaveBeenCalledWith(
      'session',
      token,
      expect.objectContaining({ httpOnly: true, sameSite: 'lax' }),
    )
  })

  it('does not renew a fresh session', async () => {
    const user = await testDb.user.create({
      data: { email: 'ken@example.com', passwordHash: 'x' },
    })
    const token = 'fresh-token'
    await testDb.session.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + 29 * 24 * 60 * 60 * 1000),
      },
    })
    mocks.cookieStore.get.mockReturnValue({ value: token })

    await verifySession()

    expect(mocks.cookieStore.set).not.toHaveBeenCalled()
  })
})