import { beforeEach, describe, expect, it, vi } from 'vitest';
import { testDb, resetTestDb } from '@/test/test-db';
import { hashPassword } from '@/lib/auth/password';
import { hashToken } from '@/lib/auth/session';
import { resetAllRateLimits } from '@/lib/auth/rate-limit';

const mocks = vi.hoisted(() => {
  const cookieStore = { get: vi.fn(), set: vi.fn(), delete: vi.fn() };
  const redirect = vi.fn();
  const refresh = vi.fn();
  return { cookieStore, redirect, refresh };
});

vi.mock('next/headers', () => ({ cookies: () => mocks.cookieStore }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('next/cache', () => ({ refresh: mocks.refresh }));
vi.mock('@/lib/db', async () => {
  const { testDb } = await import('@/test/test-db');
  return { db: testDb };
});

import { lockApp, unlockApp } from '@/actions/app-lock';

const NEXT_REDIRECT = 'NEXT_REDIRECT';

function pinForm(pin: string): FormData {
  const form = new FormData();
  form.set('pin', pin);
  return form;
}

async function seedLockedSession() {
  const user = await testDb.user.create({
    data: {
      email: 'ken@example.com',
      passwordHash: 'account-password-hash',
      appLockPinHash: await hashPassword('1234'),
    },
  });
  const token = 'app-lock-session-token';
  const session = await testDb.session.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + 100_000),
      appLockVerifiedAt: null,
    },
  });
  mocks.cookieStore.get.mockReturnValue({ value: token });
  return { session, user };
}

describe('App Lock actions', () => {
  beforeEach(async () => {
    await resetTestDb();
    resetAllRateLimits();
    vi.clearAllMocks();
    mocks.redirect.mockImplementation(() => {
      throw new Error(NEXT_REDIRECT);
    });
  });

  it('unlocks only the current session with the correct PIN', async () => {
    const { session, user } = await seedLockedSession();
    const otherSession = await testDb.session.create({
      data: {
        userId: user.id,
        tokenHash: hashToken('other-session-token'),
        expiresAt: new Date(Date.now() + 100_000),
        appLockVerifiedAt: null,
      },
    });

    await expect(unlockApp(undefined, pinForm('1234'))).rejects.toThrow(NEXT_REDIRECT);
    expect(mocks.redirect).toHaveBeenCalledWith('/timeline');
    expect(
      (await testDb.session.findUnique({ where: { id: session.id } }))
        ?.appLockVerifiedAt,
    ).not.toBeNull();
    expect(
      (await testDb.session.findUnique({ where: { id: otherSession.id } }))
        ?.appLockVerifiedAt,
    ).toBeNull();
  });

  it('does not unlock with an incorrect PIN', async () => {
    const { session } = await seedLockedSession();

    await expect(unlockApp(undefined, pinForm('9999'))).resolves.toEqual({
      error: 'Incorrect PIN.',
    });
    expect(
      (await testDb.session.findUnique({ where: { id: session.id } }))
        ?.appLockVerifiedAt,
    ).toBeNull();
  });

  it('manually locks the current session', async () => {
    const { session } = await seedLockedSession();
    await testDb.session.update({
      where: { id: session.id },
      data: { appLockVerifiedAt: new Date() },
    });

    await expect(lockApp()).rejects.toThrow(NEXT_REDIRECT);
    expect(mocks.redirect).toHaveBeenCalledWith('/unlock');
    expect(
      (await testDb.session.findUnique({ where: { id: session.id } }))
        ?.appLockVerifiedAt,
    ).toBeNull();
  });
});
