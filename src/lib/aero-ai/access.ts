import 'server-only';

import { db } from '@/lib/db';
import { getOptionalSession, isAppLockLocked, type SessionInfo } from '@/lib/dal';
import { getDemoCredentials } from '@/lib/auth/demo-config';

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
