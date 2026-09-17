'use server';

import { refresh } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { checkRateLimit, resetRateLimit } from '@/lib/auth/rate-limit';
import {
  appLockPinSchema,
  appLockTimeoutSchema,
  enableAppLockSchema,
} from '@/lib/auth/schemas';
import {
  verifyAuthenticatedSession,
  verifySession,
} from '@/lib/dal';

export type AppLockState = { error?: string; success?: string } | undefined

const INCORRECT_PIN = 'Incorrect PIN.';
const RATE_LIMITED = 'Too many attempts. Please try again later.';

export async function enableAppLock(
  _prevState: AppLockState,
  formData: FormData,
): Promise<AppLockState> {
  const session = await verifySession();
  const parsed = enableAppLockSchema.safeParse({
    pin: formData.get('pin'),
    timeoutMinutes: formData.get('timeoutMinutes'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Unable to enable App Lock.' };
  }

  const appLockPinHash = await hashPassword(parsed.data.pin);
  await db.$transaction([
    db.user.update({
      where: { id: session.userId },
      data: {
        appLockPinHash,
        appLockTimeoutMinutes: parsed.data.timeoutMinutes,
      },
    }),
    db.session.update({
      where: { id: session.sessionId },
      data: { appLockVerifiedAt: new Date() },
    }),
  ]);

  refresh();
  return { success: 'App Lock enabled.' };
}

export async function changeAppLockPin(
  _prevState: AppLockState,
  formData: FormData,
): Promise<AppLockState> {
  const session = await verifySession();
  const parsed = appLockPinSchema.safeParse(formData.get('pin'));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Unable to change the PIN.' };
  }

  await db.user.update({
    where: { id: session.userId },
    data: { appLockPinHash: await hashPassword(parsed.data) },
  });

  return { success: 'PIN changed.' };
}

export async function updateAppLockTimeout(
  _prevState: AppLockState,
  formData: FormData,
): Promise<AppLockState> {
  const session = await verifySession();
  const parsed = appLockTimeoutSchema.safeParse(formData.get('timeoutMinutes'));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Unable to update the timeout.' };
  }

  await db.$transaction([
    db.user.update({
      where: { id: session.userId },
      data: { appLockTimeoutMinutes: parsed.data },
    }),
    db.session.update({
      where: { id: session.sessionId },
      data: { appLockVerifiedAt: new Date() },
    }),
  ]);

  refresh();
  return { success: 'Lock timeout updated.' };
}

export async function disableAppLock(): Promise<void> {
  const session = await verifySession();
  await db.$transaction([
    db.user.update({
      where: { id: session.userId },
      data: { appLockPinHash: null },
    }),
    db.session.updateMany({
      where: { userId: session.userId },
      data: { appLockVerifiedAt: null },
    }),
  ]);
  refresh();
}

async function lockCurrentSession(): Promise<boolean> {
  const session = await verifyAuthenticatedSession();
  if (!session.appLockEnabled) return false;

  await db.session.update({
    where: { id: session.sessionId },
    data: { appLockVerifiedAt: null },
  });
  return true;
}

export async function lockApp(): Promise<void> {
  const locked = await lockCurrentSession();
  redirect(locked ? '/unlock' : '/timeline');
}

export async function lockAppForIdle(): Promise<void> {
  await lockCurrentSession();
}

export async function refreshAppLockActivity(): Promise<void> {
  const session = await verifySession();
  if (!session.appLockEnabled || session.appLockTimeoutMinutes === 0) return;

  await db.session.update({
    where: { id: session.sessionId },
    data: { appLockVerifiedAt: new Date() },
  });
}

export async function unlockApp(
  _prevState: AppLockState,
  formData: FormData,
): Promise<AppLockState> {
  const session = await verifyAuthenticatedSession();
  if (!session.appLockEnabled) redirect('/timeline');

  const parsed = appLockPinSchema.safeParse(formData.get('pin'));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? INCORRECT_PIN };
  }

  const limitKey = session.sessionId;
  if (!checkRateLimit('app-lock', limitKey).allowed) {
    return { error: RATE_LIMITED };
  }

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { appLockPinHash: true },
  });
  if (!user?.appLockPinHash || !(await verifyPassword(parsed.data, user.appLockPinHash))) {
    return { error: INCORRECT_PIN };
  }

  resetRateLimit('app-lock', limitKey);
  await db.session.update({
    where: { id: session.sessionId },
    data: { appLockVerifiedAt: new Date() },
  });
  redirect('/timeline');
}
