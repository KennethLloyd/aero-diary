import 'server-only';

import { db } from '@/lib/db';
import { getOptionalSession, isAppLockLocked, type SessionInfo } from '@/lib/dal';
import { getDemoCredentials } from '@/lib/auth/demo-config';
import { hashToken } from '@/lib/auth/session';

export class AeroAiAccessError extends Error {
  constructor(
    message: string,
    readonly status: 401 | 403 | 423,
  ) {
    super(message);
    this.name = 'AeroAiAccessError';
  }
}

export async function isPrivateAeroAiUser(userId: string): Promise<boolean> {
  const demoEmail = getDemoCredentials()?.email;
  if (!demoEmail) return true;

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });
  return user !== null && user.email.toLowerCase() !== demoEmail;
}

export async function hasAeroAiToken(userId: string): Promise<boolean> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { aeroAiTokenHash: true },
  });
  return user !== null && user.aeroAiTokenHash !== null;
}

export async function requireAeroAiBearerToken(authorization: string): Promise<string> {
  const match = /^Bearer ([A-Za-z0-9_-]{43})$/i.exec(authorization);
  if (!match?.[1]) {
    throw new AeroAiAccessError('A valid Aero AI bearer token is required.', 401);
  }

  const user = await db.user.findUnique({
    where: { aeroAiTokenHash: hashToken(match[1]) },
    select: { id: true },
  });
  if (!user) {
    throw new AeroAiAccessError('The Aero AI token is invalid or revoked.', 401);
  }
  if (!(await isPrivateAeroAiUser(user.id))) {
    throw new AeroAiAccessError('Aero AI is available only on the private account.', 403);
  }

  return user.id;
}

export async function requireAeroAiSession(): Promise<SessionInfo> {
  const session = await getOptionalSession();
  if (!session) {
    throw new AeroAiAccessError('Your session has expired. Please sign in again.', 401);
  }

  if (isAppLockLocked(session)) {
    if (session.appLockVerifiedAt) {
      await db.session.updateMany({
        where: { id: session.sessionId },
        data: { appLockVerifiedAt: null },
      });
    }
    throw new AeroAiAccessError('Aero Diary is locked. Unlock it to continue.', 423);
  }

  if (!(await isPrivateAeroAiUser(session.userId))) {
    throw new AeroAiAccessError('Aero AI is available only on the private account.', 403);
  }

  return session;
}
