import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import {
  hashToken,
  sessionExpiry,
  SESSION_COOKIE,
  SESSION_RENEW_THRESHOLD_MS,
  setSessionCookie,
} from '@/lib/auth/session';

export type SessionInfo = {
  isAuth: true
  sessionId: string
  userId: string
  appLockEnabled: boolean
  appLockTimeoutMinutes: number
  appLockVerifiedAt: Date | null
}

async function readSession(): Promise<SessionInfo | null> {
  const cookie = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!cookie) return null;

  const tokenHash = hashToken(cookie);
  const session = await db.session.findUnique({
    where: { tokenHash },
    include: {
      user: {
        select: {
          appLockPinHash: true,
          appLockTimeoutMinutes: true,
        },
      },
    },
  });

  if (!session || session.expiresAt.getTime() < Date.now()) {
    if (session) {
      await db.session.delete({ where: { id: session.id } });
    }
    return null;
  }

  if (session.expiresAt.getTime() - Date.now() < SESSION_RENEW_THRESHOLD_MS) {
    const expiresAt = sessionExpiry();
    await db.session.update({
      where: { id: session.id },
      data: { expiresAt },
    });
    await setSessionCookie(cookie, expiresAt);
  }

  return {
    isAuth: true,
    sessionId: session.id,
    userId: session.userId,
    appLockEnabled: session.user.appLockPinHash !== null,
    appLockTimeoutMinutes: session.user.appLockTimeoutMinutes,
    appLockVerifiedAt: session.appLockVerifiedAt,
  };
}

export const getOptionalSession = cache(readSession);

export const verifyAuthenticatedSession = cache(async (): Promise<SessionInfo> => {
  const session = await getOptionalSession();
  if (!session) redirect('/');
  return session;
});

export function isAppLockLocked(
  session: SessionInfo,
  now = Date.now(),
): boolean {
  if (!session.appLockEnabled) return false;
  if (!session.appLockVerifiedAt) return true;
  if (session.appLockTimeoutMinutes === 0) return false;

  return (
    now - session.appLockVerifiedAt.getTime() >=
    session.appLockTimeoutMinutes * 60 * 1000
  );
}

// The auth gate starts every protected action and data read.
// React's `cache()` memoizes it within a render pass.
export const verifySession = cache(async (): Promise<SessionInfo> => {
  const session = await verifyAuthenticatedSession();
  if (isAppLockLocked(session)) {
    if (session.appLockVerifiedAt) {
      await db.session.update({
        where: { id: session.sessionId },
        data: { appLockVerifiedAt: null },
      });
    }
    redirect('/unlock');
  }
  return session;
});
