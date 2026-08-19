import { describe, expect, it } from 'vitest';
import {
  generateSessionToken,
  hashToken,
  sessionExpiry,
  SESSION_TTL_MS,
} from '@/lib/auth/session';

describe('session tokens', () => {
  it('generates a 32-byte base64url token (256 bits of entropy)', () => {
    const token = generateSessionToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    // 32 bytes → 43 base64url chars (no padding)
    expect(token.length).toBe(43);
  });

  it('generates unique tokens', () => {
    expect(generateSessionToken()).not.toBe(generateSessionToken());
  });

  it('hashes a token deterministically with SHA-256', () => {
    const token = 'some-raw-token';
    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(token)).not.toBe(token);
  });

  it('computes a ~30-day expiry', () => {
    const now = Date.now();
    const expiry = sessionExpiry(now);
    expect(expiry.getTime() - now).toBe(SESSION_TTL_MS);
  });
});