import { beforeEach, describe, expect, it } from 'vitest'
import {
  checkRateLimit,
  resetAllRateLimits,
  resetRateLimit,
} from '@/lib/auth/rate-limit'

describe('rate limiter', () => {
  beforeEach(() => {
    resetAllRateLimits()
  })

  it('allows attempts up to the limit', () => {
    const now = 1_000_000
    for (let i = 0; i < 3; i++) {
      expect(checkRateLimit('email', 'a@b.c', now + i)).toEqual({
        allowed: true,
        retryAfterMs: 0,
      })
    }
  })

  it('blocks the attempt after the limit with exponential backoff', () => {
    const now = 1_000_000
    for (let i = 0; i < 3; i++) {
      checkRateLimit('email', 'a@b.c', now + i)
    }
    const blocked = checkRateLimit('email', 'a@b.c', now + 3)
    expect(blocked.allowed).toBe(false)
    // First overage → 1 minute backoff.
    expect(blocked.retryAfterMs).toBe(60_000)
  })

  it('doubles the backoff on further overages', () => {
    const now = 1_000_000
    // First block: 3 attempts, then the 4th is blocked for 1 minute.
    for (let i = 0; i < 3; i++) {
      checkRateLimit('email', 'a@b.c', now + i)
    }
    const first = checkRateLimit('email', 'a@b.c', now + 3)
    expect(first.allowed).toBe(false)
    expect(first.retryAfterMs).toBe(60_000)

    // Wait out the backoff, then 3 fresh attempts → second block is 2 minutes.
    const t = now + 3 + 60_000
    expect(checkRateLimit('email', 'a@b.c', t).allowed).toBe(true)
    for (let i = 1; i < 3; i++) {
      checkRateLimit('email', 'a@b.c', t + i)
    }
    const second = checkRateLimit('email', 'a@b.c', t + 3)
    expect(second.allowed).toBe(false)
    expect(second.retryAfterMs).toBe(120_000)
  })

  it('stays blocked until the backoff window elapses', () => {
    const now = 1_000_000
    for (let i = 0; i < 3; i++) {
      checkRateLimit('email', 'a@b.c', now + i)
    }
    checkRateLimit('email', 'a@b.c', now + 3)
    // Still blocked 30s into the 60s backoff.
    expect(
      checkRateLimit('email', 'a@b.c', now + 3 + 30_000).allowed,
    ).toBe(false)
    // Allowed again after the backoff elapses.
    expect(
      checkRateLimit('email', 'a@b.c', now + 3 + 60_000).allowed,
    ).toBe(true)
  })

  it('resets the window after 15 minutes', () => {
    const now = 1_000_000
    for (let i = 0; i < 3; i++) {
      checkRateLimit('email', 'a@b.c', now + i)
    }
    // 16 minutes later — fresh window, allowed again.
    expect(
      checkRateLimit('email', 'a@b.c', now + 16 * 60_000).allowed,
    ).toBe(true)
  })

  it('tracks scopes independently (per-IP vs per-email)', () => {
    const now = 1_000_000
    for (let i = 0; i < 3; i++) {
      checkRateLimit('ip', '1.2.3.4', now + i)
    }
    // A different scope/id is unaffected.
    expect(checkRateLimit('email', 'a@b.c', now + 3).allowed).toBe(true)
    // Same scope, different id is unaffected.
    expect(checkRateLimit('ip', '5.6.7.8', now + 3).allowed).toBe(true)
  })

  it('resetRateLimit clears a bucket', () => {
    const now = 1_000_000
    for (let i = 0; i < 3; i++) {
      checkRateLimit('email', 'a@b.c', now + i)
    }
    resetRateLimit('email', 'a@b.c')
    expect(checkRateLimit('email', 'a@b.c', now + 3).allowed).toBe(true)
  })
})