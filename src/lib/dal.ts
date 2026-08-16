import 'server-only'
import { cache } from 'react'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import {
  hashToken,
  sessionExpiry,
  SESSION_COOKIE,
  SESSION_RENEW_THRESHOLD_MS,
  setSessionCookie,
} from '@/lib/auth/session'

export type SessionInfo = {
  isAuth: true
  userId: string
}

// The single auth gate (ADR-0002): called at the top of every protected action
// and data read. Memoized per render pass via React's `cache()`.
export const verifySession = cache(async (): Promise<SessionInfo> => {
  const cookie = (await cookies()).get(SESSION_COOKIE)?.value
  if (!cookie) {
    redirect('/')
  }

  const tokenHash = hashToken(cookie)
  const session = await db.session.findUnique({ where: { tokenHash } })

  if (!session || session.expiresAt.getTime() < Date.now()) {
    if (session) {
      await db.session.delete({ where: { id: session.id } })
    }
    redirect('/')
  }

  if (session.expiresAt.getTime() - Date.now() < SESSION_RENEW_THRESHOLD_MS) {
    const expiresAt = sessionExpiry()
    await db.session.update({
      where: { id: session.id },
      data: { expiresAt },
    })
    await setSessionCookie(cookie, expiresAt)
  }

  return { isAuth: true, userId: session.userId }
})