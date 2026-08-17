import 'server-only'

import { db } from '@/lib/db'
import { verifySession } from '@/lib/dal'
import type { ActivityOption } from '@/lib/journal/types'

export async function listActivities(): Promise<ActivityOption[]> {
  const session = await verifySession()
  return db.activity.findMany({
    where: { userId: session.userId, isArchived: false },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true, emoji: true },
  })
}
