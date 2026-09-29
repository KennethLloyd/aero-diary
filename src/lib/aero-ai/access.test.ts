import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionInfo } from '@/lib/dal';
import { testDb, resetTestDb } from '@/test/test-db';

const mocks = vi.hoisted(() => ({ getOptionalSession: vi.fn() }));

vi.mock('@/lib/dal', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/dal')>();
  return { ...actual, getOptionalSession: mocks.getOptionalSession };
});

import { AeroAiAccessError, requireAeroAiSession } from './access';

describe('Aero AI access gate', () => {
  const originalDemoEmail = process.env.DEMO_EMAIL;
  const originalDemoPassword = process.env.DEMO_PASSWORD;

  beforeEach(async () => {
    await resetTestDb();
    process.env.DEMO_EMAIL = 'aero-demo@example.com';
    process.env.DEMO_PASSWORD = 'demo-password-123';
    mocks.getOptionalSession.mockReset();
  });

  afterEach(() => {
    if (originalDemoEmail === undefined) delete process.env.DEMO_EMAIL;
    else process.env.DEMO_EMAIL = originalDemoEmail;
    if (originalDemoPassword === undefined) delete process.env.DEMO_PASSWORD;
    else process.env.DEMO_PASSWORD = originalDemoPassword;
  });

  it('returns an actionable unauthorized error when no session exists', async () => {
    mocks.getOptionalSession.mockResolvedValue(null);
    await expect(requireAeroAiSession()).rejects.toMatchObject({ status: 401 });
  });

  it('clears expired App Lock verification and blocks the request', async () => {
    const user = await testDb.user.create({ data: { email: 'private@example.com', passwordHash: 'hash' } });
    const session = await testDb.session.create({
      data: {
        userId: user.id,
        tokenHash: 'a'.repeat(64),
        expiresAt: new Date(Date.now() + 60_000),
        appLockVerifiedAt: new Date(Date.now() - 600_000),
      },
    });
    mocks.getOptionalSession.mockResolvedValue({
      isAuth: true,
      sessionId: session.id,
      userId: user.id,
      appLockEnabled: true,
      appLockTimeoutMinutes: 5,
      appLockVerifiedAt: session.appLockVerifiedAt,
    } satisfies SessionInfo);

    await expect(requireAeroAiSession()).rejects.toBeInstanceOf(AeroAiAccessError);
    await expect(requireAeroAiSession()).rejects.toMatchObject({ status: 423 });
    expect((await testDb.session.findUniqueOrThrow({ where: { id: session.id } })).appLockVerifiedAt).toBeNull();
  });

  it('rejects the configured demo account while allowing the private account', async () => {
    const demo = await testDb.user.create({ data: { email: 'aero-demo@example.com', passwordHash: 'hash' } });
    mocks.getOptionalSession.mockResolvedValue(sessionFor(demo.id));
    await expect(requireAeroAiSession()).rejects.toMatchObject({ status: 403 });

    const owner = await testDb.user.create({ data: { email: 'private@example.com', passwordHash: 'hash' } });
    mocks.getOptionalSession.mockResolvedValue(sessionFor(owner.id));
    await expect(requireAeroAiSession()).resolves.toMatchObject({ userId: owner.id });
  });
});

function sessionFor(userId: string): SessionInfo {
  return {
    isAuth: true,
    sessionId: 'session-id',
    userId,
    appLockEnabled: false,
    appLockTimeoutMinutes: 5,
    appLockVerifiedAt: null,
  };
}
