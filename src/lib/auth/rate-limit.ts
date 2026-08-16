// In-memory per-IP + per-email throttle with exponential backoff (ADR-0002).
// Single-process SQLite server, so in-memory is sufficient. `now` injectable.

export type RateLimitResult = {
  allowed: boolean
  retryAfterMs: number
}

type Bucket = {
  count: number
  windowStart: number
  blockedUntil: number
  blocks: number // how many times the limit has been exceeded this window
}

const WINDOW_MS = 15 * 60 * 1000 // 15-minute sliding window
const MAX_ATTEMPTS = 3 // allowed per window before throttling
const BACKOFF_BASE_MS = 60 * 1000 // 1 minute, doubles per block

const buckets = new Map<string, Bucket>()

function keyFor(scope: string, id: string): string {
  return `${scope}:${id}`
}

export function checkRateLimit(
  scope: string,
  id: string,
  now = Date.now(),
): RateLimitResult {
  const key = keyFor(scope, id)
  const bucket = buckets.get(key)

  // First attempt, or the window has elapsed — start a fresh bucket.
  if (!bucket || now - bucket.windowStart >= WINDOW_MS) {
    buckets.set(key, {
      count: 1,
      windowStart: now,
      blockedUntil: 0,
      blocks: 0,
    })
    return { allowed: true, retryAfterMs: 0 }
  }

  // Still inside a backoff block.
  if (now < bucket.blockedUntil) {
    return { allowed: false, retryAfterMs: bucket.blockedUntil - now }
  }

  // Backoff elapsed — fresh attempts; `blocks` persists so the next is longer.
  if (bucket.blockedUntil > 0) {
    bucket.count = 1
    bucket.blockedUntil = 0
    return { allowed: true, retryAfterMs: 0 }
  }

  bucket.count += 1
  if (bucket.count > MAX_ATTEMPTS) {
    bucket.blocks += 1
    const backoffMs = BACKOFF_BASE_MS * 2 ** (bucket.blocks - 1)
    bucket.blockedUntil = now + backoffMs
    return { allowed: false, retryAfterMs: backoffMs }
  }

  return { allowed: true, retryAfterMs: 0 }
}

export function resetRateLimit(scope: string, id: string): void {
  buckets.delete(keyFor(scope, id))
}

// Test hook: clear all buckets between tests.
export function resetAllRateLimits(): void {
  buckets.clear()
}