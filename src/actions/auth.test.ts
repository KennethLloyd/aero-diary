import { beforeEach, describe, expect, it, vi } from 'vitest';
import { testDb, resetTestDb } from '@/test/test-db';
import { hashPassword } from '@/lib/auth/password';
import { hashToken } from '@/lib/auth/session';
import { resetAllRateLimits } from '@/lib/auth/rate-limit';

const mocks = vi.hoisted(() => {
  const cookieStore = { get: vi.fn(), set: vi.fn(), delete: vi.fn() };
  const headerStore = { get: vi.fn() };
  const redirect = vi.fn();
  return { cookieStore, headerStore, redirect };
});

vi.mock('next/headers', () => ({
  cookies: () => mocks.cookieStore,
  headers: () => mocks.headerStore,
}));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('@/lib/db', async () => {
  const { testDb } = await import('@/test/test-db');
  return { db: testDb };
});

import { login, loginDemo, logout } from '@/actions/auth';

const NEXT_REDIRECT = 'NEXT_REDIRECT';
const GENERIC_ERROR = 'Invalid email or password.';
const RATE_LIMITED = 'Too many attempts. Please try again later.';

function form(email: string, password: string): FormData {
  const f = new FormData();
  f.set('email', email);
  f.set('password', password);
  return f;
}

async function seedUser(email = 'ken@example.com', password = 'correct-horse') {
  return testDb.user.create({
    data: { email, passwordHash: await hashPassword(password) },
  });
}

describe('login action', () => {
  beforeEach(async () => {
    await resetTestDb();
    resetAllRateLimits();
    vi.clearAllMocks();
    mocks.redirect.mockImplementation(() => {
      throw new Error(NEXT_REDIRECT);
    });
    mocks.headerStore.get.mockReturnValue(undefined); // no x-forwarded-for
  });

  it('rejects invalid input with a generic error (invalid input branch)', async () => {
    const state = await login(undefined, form('not-an-email', 'x'));
    expect(state).toEqual({ error: GENERIC_ERROR });
    expect(await testDb.session.count()).toBe(0);
    expect(mocks.cookieStore.set).not.toHaveBeenCalled();
  });

  it('rejects a wrong password with a generic error (wrong owner branch)', async () => {
    await seedUser();
    const state = await login(undefined, form('ken@example.com', 'wrong-password'));
    expect(state).toEqual({ error: GENERIC_ERROR });
    expect(await testDb.session.count()).toBe(0);
    expect(mocks.cookieStore.set).not.toHaveBeenCalled();
  });

  it('rejects an unknown email with the same generic error (no enumeration)', async () => {
    const state = await login(undefined, form('ghost@example.com', 'whatever-pass'));
    expect(state).toEqual({ error: GENERIC_ERROR });
    expect(await testDb.session.count()).toBe(0);
  });

  it('creates a session and sets the cookie on valid credentials (valid branch)', async () => {
    const user = await seedUser();
    await expect(login(undefined, form('ken@example.com', 'correct-horse'))).rejects.toThrow(
      NEXT_REDIRECT,
    );
    expect(mocks.redirect).toHaveBeenCalledWith('/timeline');

    const sessions = await testDb.session.findMany();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].userId).toBe(user.id);

    // Cookie holds the raw token; the DB stores only its SHA-256 hash.
    const [name, rawToken, options] = mocks.cookieStore.set.mock.calls[0];
    expect(name).toBe('session');
    expect(hashToken(rawToken)).toBe(sessions[0].tokenHash);
    expect(options).toMatchObject({
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
    });
  });

  it('rate-limits after too many attempts, even with correct credentials', async () => {
    await seedUser();
    for (let i = 0; i < 3; i++) {
      await login(undefined, form('ken@example.com', 'wrong-password'));
    }
    const state = await login(undefined, form('ken@example.com', 'correct-horse'));
    expect(state).toEqual({ error: RATE_LIMITED });
    expect(await testDb.session.count()).toBe(0);
  });

  it('clears only the per-email throttle on a successful login', async () => {
    await seedUser();
    // 2 failed attempts from IP 1.1.1.1.
    mocks.headerStore.get.mockReturnValue('1.1.1.1');
    for (let i = 0; i < 2; i++) {
      await login(undefined, form('ken@example.com', 'wrong-password'));
    }
    // Success clears the email bucket.
    await expect(
      login(undefined, form('ken@example.com', 'correct-horse')),
    ).rejects.toThrow(NEXT_REDIRECT);
    // A fresh failed attempt from a clean IP is allowed again — the email
    // throttle is what a success resets.
    mocks.headerStore.get.mockReturnValue('2.2.2.2');
    const state = await login(undefined, form('ken@example.com', 'wrong-password'));
    expect(state).toEqual({ error: GENERIC_ERROR });
  });

  it('does not clear the per-IP throttle on a successful login', async () => {
    // Two users share one IP; one account's success must not reset the
    // IP-wide guard (a valid credential can't unlock brute-force guessing).
    await seedUser('ken@example.com', 'correct-horse');
    await seedUser('ada@example.com', 'ada-password');
    mocks.headerStore.get.mockReturnValue('1.1.1.1');
    for (let i = 0; i < 2; i++) {
      await login(undefined, form('ken@example.com', 'wrong-password'));
    }
    // Successful login for a second account on the same IP.
    await expect(
      login(undefined, form('ada@example.com', 'ada-password')),
    ).rejects.toThrow(NEXT_REDIRECT);
    // The IP bucket survived the success: the next attempt is throttled.
    const state = await login(undefined, form('ada@example.com', 'ada-password'));
    expect(state).toEqual({ error: RATE_LIMITED });
  });
});

describe('loginDemo action', () => {
  beforeEach(async () => {
    await resetTestDb();
    vi.clearAllMocks();
    process.env.DEMO_EMAIL = 'demo@example.com';
    process.env.DEMO_PASSWORD = 'demo-password';
    mocks.redirect.mockImplementation(() => {
      throw new Error(NEXT_REDIRECT);
    });
  });

  it('redirects to the login page when demo credentials are absent', async () => {
    delete process.env.DEMO_EMAIL;
    delete process.env.DEMO_PASSWORD;
    await expect(loginDemo()).rejects.toThrow(NEXT_REDIRECT);
    expect(mocks.redirect).toHaveBeenCalledWith('/');
    expect(await testDb.session.count()).toBe(0);
  });

  it('authenticates the configured account and opens a session', async () => {
    const demo = await testDb.user.create({
      data: {
        email: 'demo@example.com',
        passwordHash: await hashPassword('demo-password'),
      },
    });
    await expect(loginDemo()).rejects.toThrow(NEXT_REDIRECT);
    expect(mocks.redirect).toHaveBeenCalledWith('/timeline');
    const sessions = await testDb.session.findMany();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].userId).toBe(demo.id);
  });

  it('refuses to open a session when configured credentials do not match', async () => {
    await testDb.user.create({
      data: {
        email: 'demo@example.com',
        passwordHash: await hashPassword('a-real-password'),
      },
    });
    await expect(loginDemo()).rejects.toThrow(NEXT_REDIRECT);
    expect(mocks.redirect).toHaveBeenCalledWith('/');
    expect(await testDb.session.count()).toBe(0);
  });
});

describe('logout action', () => {
  beforeEach(async () => {
    await resetTestDb();
    vi.clearAllMocks();
    mocks.redirect.mockImplementation(() => {
      throw new Error(NEXT_REDIRECT);
    });
  });

  it('clears the cookie and redirects when anonymous (no session)', async () => {
    mocks.cookieStore.get.mockReturnValue(undefined);
    await expect(logout()).rejects.toThrow(NEXT_REDIRECT);
    expect(mocks.redirect).toHaveBeenCalledWith('/');
    expect(mocks.cookieStore.delete).toHaveBeenCalledWith('session');
    expect(await testDb.session.count()).toBe(0);
  });

  it('deletes the session row and clears the cookie (valid branch)', async () => {
    const user = await testDb.user.create({
      data: { email: 'ken@example.com', passwordHash: 'x' },
    });
    const token = 'raw-session-token';
    await testDb.session.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + 100_000),
      },
    });
    mocks.cookieStore.get.mockReturnValue({ value: token });

    await expect(logout()).rejects.toThrow(NEXT_REDIRECT);
    expect(mocks.redirect).toHaveBeenCalledWith('/');
    // Instant revoke: the session row is gone.
    expect(await testDb.session.count()).toBe(0);
    expect(mocks.cookieStore.delete).toHaveBeenCalledWith('session');
  });
});
