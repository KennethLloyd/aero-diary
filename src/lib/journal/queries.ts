import 'server-only'

import { db } from '@/lib/db'
import type { ActivityOption } from '@/lib/journal/types'

export async function listActivities(): Promise<ActivityOption[]> {
  return db.activity.findMany({
    where: { isArchived: false },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true, emoji: true },
  })
}
