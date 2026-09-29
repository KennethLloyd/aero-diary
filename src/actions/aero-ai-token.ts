'use server';

import { refresh } from 'next/cache';
import { db } from '@/lib/db';
import { verifySession } from '@/lib/dal';
import { isPrivateAeroAiUser } from '@/lib/aero-ai/access';
import { generateSessionToken, hashToken } from '@/lib/auth/session';

export type AeroAiTokenResult = {
  error?: string
  success?: string
  token?: string
  hasToken?: boolean
}

export async function generateAeroAiToken(): Promise<AeroAiTokenResult> {
  const session = await verifySession();
  if (!(await isPrivateAeroAiUser(session.userId))) {
    return { error: 'Aero AI tokens are available only on the private account.', hasToken: false };
  }

  const token = generateSessionToken();
  try {
    await db.user.update({
      where: { id: session.userId },
      data: { aeroAiTokenHash: hashToken(token) },
    });
  } catch {
    return { error: 'Unable to generate an Aero AI token. Please try again.' };
  }

  refresh();
  return {
    success: 'Token generated. Copy it now; it will not be shown again.',
    token,
    hasToken: true,
  };
}

export async function revokeAeroAiToken(): Promise<AeroAiTokenResult> {
  const session = await verifySession();
  if (!(await isPrivateAeroAiUser(session.userId))) {
    return { error: 'Aero AI tokens are available only on the private account.', hasToken: false };
  }

  try {
    await db.user.update({
      where: { id: session.userId },
      data: { aeroAiTokenHash: null },
    });
  } catch {
    return { error: 'Unable to revoke the Aero AI token. Please try again.' };
  }

  refresh();
  return { success: 'Token revoked.', hasToken: false };
}
