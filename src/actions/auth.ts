'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { verifyPassword, DUMMY_PASSWORD_HASH } from '@/lib/auth/password';
import {
  generateSessionToken,
  hashToken,
  sessionExpiry,
  setSessionCookie,
  clearSessionCookie,
  SESSION_COOKIE,
} from '@/lib/auth/session';
import { checkRateLimit, resetRateLimit } from '@/lib/auth/rate-limit';
import { loginSchema, DEMO_EMAIL } from '@/lib/auth/schemas';

// Same message for unknown email and wrong password (no user enumeration).
const INVALID_CREDENTIALS = 'Invalid email or password.';
const RATE_LIMITED = 'Too many attempts. Please try again later.';

export type LoginState = { error?: string } | undefined

async function clientIp(): Promise<string> {
  const headerStore = await headers();
  const forwarded = (headerStore.get('x-forwarded-for') ?? '').split(',')[0];
  return forwarded?.trim() || 'unknown';
}

export async function login(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) {
    return { error: INVALID_CREDENTIALS };
  }
  const { email, password } = parsed.data;

  // Throttle per-IP and per-email before touching the DB (ADR-0002).
  const ip = await clientIp();
  const ipCheck = checkRateLimit('ip', ip);
  const emailCheck = checkRateLimit('email', email);
  if (!ipCheck.allowed || !emailCheck.allowed) {
    return { error: RATE_LIMITED };
  }

  const user = await db.user.findUnique({ where: { email } });

  // Timing-uniform verify against a dummy hash for unknown emails.
  const passwordOk = user
    ? await verifyPassword(password, user.passwordHash)
    : await verifyPassword(password, DUMMY_PASSWORD_HASH);

  if (!user || !passwordOk) {
    return { error: INVALID_CREDENTIALS };
  }

  // Success — clear the per-email throttle only. The per-IP throttle stays:
  // one valid credential must not reset the IP-wide guard (that would let an
  // attacker with a single account keep guessing others from the same IP).
  resetRateLimit('email', email);
  await createSession(user.id);

  redirect('/timeline');
}

// Mint a session (ADR-0002): opaque token, SHA-256 hash row, httpOnly cookie.
async function createSession(userId: string): Promise<void> {
  const token = generateSessionToken();
  const expiresAt = sessionExpiry();
  await db.session.create({
    data: { userId, tokenHash: hashToken(token), expiresAt },
  });
  await setSessionCookie(token, expiresAt);
}

// One-tap demo login (ADR-0006): same session path as a real login.
export async function loginDemo(): Promise<void> {
  // `isDemo` guard: the button must only open the seeded demo account — never
  // a real account that happens to share the demo email (operator error).
  const demo = await db.user.findFirst({
    where: { email: DEMO_EMAIL, isDemo: true },
  });
  if (!demo) {
    // Demo user not seeded yet — fall back to the login screen.
    redirect('/');
  }

  await createSession(demo.id);
  redirect('/timeline');
}

// Logout = delete the session row (instant revoke) + clear the cookie.
export async function logout(): Promise<void> {
  const cookie = (await cookies()).get(SESSION_COOKIE)?.value;
  if (cookie) {
    await db.session.deleteMany({ where: { tokenHash: hashToken(cookie) } });
  }
  await clearSessionCookie();
  redirect('/');
}