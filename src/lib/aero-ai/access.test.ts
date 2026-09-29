import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionInfo } from '@/lib/dal';
import { testDb, resetTestDb } from '@/test/test-db';
import { hashToken } from '@/lib/auth/session';

const mocks = vi.hoisted(() => ({ getOptionalSession: vi.fn() }));

vi.mock('@/lib/dal', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/dal')>();
  return { ...actual, getOptionalSession: mocks.getOptionalSession };
});

import { AeroAiAccessError, requireAeroAiBearerToken, requireAeroAiSession } from './access';
import { authorizeAeroAiRequest } from './http';
import { getThreadForUser } from './store';

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

  it('uses a valid bearer token without consulting a locked browser session and keeps thread ownership', async () => {
    const ownerToken = 'a'.repeat(43);
    const owner = await testDb.user.create({
      data: { email: 'private@example.com', passwordHash: 'hash', aeroAiTokenHash: hashToken(ownerToken) },
    });
    const other = await testDb.user.create({ data: { email: 'other@example.com', passwordHash: 'hash' } });
    const ownedThread = await testDb.aeroAiThread.create({ data: { userId: owner.id } });
    const otherThread = await testDb.aeroAiThread.create({ data: { userId: other.id } });
    mocks.getOptionalSession.mockResolvedValue({
      ...sessionFor(owner.id),
      appLockEnabled: true,
      appLockVerifiedAt: null,
    });

    const request = new Request('http://aero.test/api/aero-ai/threads', {
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    const access = await authorizeAeroAiRequest(request);

    expect(access).toEqual({ userId: owner.id });
    expect(mocks.getOptionalSession).not.toHaveBeenCalled();
    if (access instanceof Response) throw new Error('Expected bearer access.');
    expect(await getThreadForUser(access.userId, ownedThread.id)).not.toBeNull();
    expect(await getThreadForUser(access.userId, otherThread.id)).toBeNull();
  });

  it('rejects malformed bearer headers without falling back to a valid session', async () => {
    const owner = await testDb.user.create({ data: { email: 'private@example.com', passwordHash: 'hash' } });
    mocks.getOptionalSession.mockResolvedValue(sessionFor(owner.id));

    const response = await authorizeAeroAiRequest(new Request('http://aero.test/api/aero-ai/threads', {
      headers: { authorization: 'Bearer not-a-token' },
    }));

    expect(response).toBeInstanceOf(Response);
    if (!(response instanceof Response)) throw new Error('Expected an authorization error.');
    expect(response.status).toBe(401);
    expect(mocks.getOptionalSession).not.toHaveBeenCalled();
  });

  it('rejects invalid, revoked, and demo-account bearer tokens', async () => {
    const revokedToken = 'b'.repeat(43);
    const demoToken = 'c'.repeat(43);
    const demo = await testDb.user.create({
      data: { email: 'aero-demo@example.com', passwordHash: 'hash', aeroAiTokenHash: hashToken(demoToken) },
    });
    const revoked = await testDb.user.create({
      data: { email: 'private@example.com', passwordHash: 'hash', aeroAiTokenHash: hashToken(revokedToken) },
    });

    await expect(requireAeroAiBearerToken(`Bearer ${'d'.repeat(43)}`))
      .rejects.toMatchObject({ status: 401 });
    await testDb.user.update({ where: { id: revoked.id }, data: { aeroAiTokenHash: null } });
    await expect(requireAeroAiBearerToken(`Bearer ${revokedToken}`))
      .rejects.toMatchObject({ status: 401 });
    await expect(requireAeroAiBearerToken(`Bearer ${demoToken}`))
      .rejects.toMatchObject({ status: 403 });
    expect((await testDb.user.findUniqueOrThrow({ where: { id: demo.id } })).aeroAiTokenHash)
      .toBe(hashToken(demoToken));
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
