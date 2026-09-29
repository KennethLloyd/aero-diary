import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { testDb, resetTestDb } from '@/test/test-db';
import { generateSessionToken, hashToken } from '@/lib/auth/session';
import { requireAeroAiBearerToken } from '@/lib/aero-ai/access';

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

import { generateAeroAiToken, revokeAeroAiToken } from './aero-ai-token';

const NEXT_REDIRECT = 'NEXT_REDIRECT';
const originalDemoEmail = process.env.DEMO_EMAIL;
const originalDemoPassword = process.env.DEMO_PASSWORD;

describe('Aero AI token settings action', () => {
  beforeEach(async () => {
    await resetTestDb();
    vi.clearAllMocks();
    process.env.DEMO_EMAIL = 'aero-demo@example.com';
    process.env.DEMO_PASSWORD = 'demo-password-123';
    mocks.redirect.mockImplementation(() => {
      throw new Error(NEXT_REDIRECT);
    });
  });

  afterEach(() => {
    if (originalDemoEmail === undefined) delete process.env.DEMO_EMAIL;
    else process.env.DEMO_EMAIL = originalDemoEmail;
    if (originalDemoPassword === undefined) delete process.env.DEMO_PASSWORD;
    else process.env.DEMO_PASSWORD = originalDemoPassword;
  });

  it('reveals a generated secret once and stores only its hash', async () => {
    const { user } = await seedSession('private@example.com');

    const state = await generateAeroAiToken();
    expect(state?.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(state?.hasToken).toBe(true);
    const stored = await testDb.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(stored.aeroAiTokenHash).toBe(hashToken(state?.token ?? ''));
    expect(stored.aeroAiTokenHash).not.toBe(state?.token);
    const replacement = await generateAeroAiToken();
    expect(replacement).toMatchObject({ hasToken: true });
    expect((await testDb.user.findUniqueOrThrow({ where: { id: user.id } })).aeroAiTokenHash)
      .not.toBe(stored.aeroAiTokenHash);
    await expect(requireAeroAiBearerToken(`Bearer ${state?.token}`))
      .rejects.toMatchObject({ status: 401 });
    await expect(requireAeroAiBearerToken(`Bearer ${replacement.token}`)).resolves.toBe(user.id);
  });

  it('revokes the active token', async () => {
    const { user } = await seedSession('private@example.com');
    await testDb.user.update({ where: { id: user.id }, data: { aeroAiTokenHash: hashToken(generateSessionToken()) } });

    await expect(revokeAeroAiToken())
      .resolves.toEqual({ success: 'Token revoked.', hasToken: false });
    expect((await testDb.user.findUniqueOrThrow({ where: { id: user.id } })).aeroAiTokenHash).toBeNull();
  });

  it('denies token generation for the configured demo account', async () => {
    const { user } = await seedSession('aero-demo@example.com');

    await expect(generateAeroAiToken())
      .resolves.toMatchObject({ error: 'Aero AI tokens are available only on the private account.' });
    expect((await testDb.user.findUniqueOrThrow({ where: { id: user.id } })).aeroAiTokenHash).toBeNull();
  });

  it('requires the browser session to be unlocked before changing its token', async () => {
    const { user } = await seedSession('private@example.com', true);

    await expect(generateAeroAiToken()).rejects.toThrow(NEXT_REDIRECT);
    expect((await testDb.user.findUniqueOrThrow({ where: { id: user.id } })).aeroAiTokenHash).toBeNull();
  });
});

async function seedSession(email: string, locked = false) {
  const user = await testDb.user.create({
    data: {
      email,
      passwordHash: 'password-hash',
      ...(locked ? { appLockPinHash: 'locked' } : {}),
    },
  });
  const token = generateSessionToken();
  const session = await testDb.session.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + 60_000),
      appLockVerifiedAt: null,
    },
  });
  mocks.cookieStore.get.mockReturnValue({ value: token });
  return { user, session };
}
