import 'server-only';

import { db } from '@/lib/db';
import { verifySession } from '@/lib/dal';
import {
  getEntryDateKey,
  type CalendarMonth,
  type JournalEntry,
} from '@/lib/journal/analytics';
import type { ActivityOption } from '@/lib/journal/types';

export async function listActivities(): Promise<ActivityOption[]> {
  const session = await verifySession();
  return db.activity.findMany({
    where: { userId: session.userId, isArchived: false },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true, emoji: true },
  });
}

export async function listEntriesForMonth(month: CalendarMonth): Promise<JournalEntry[]> {
  const session = await verifySession();
  const entries = await db.entry.findMany({
    where: { userId: session.userId },
    orderBy: { date: 'desc' },
    select: {
      id: true,
      date: true,
      localOffset: true,
      mood: true,
      activities: {
        select: {
          activityId: true,
          activity: { select: { name: true, emoji: true } },
        },
      },
    },
  });

  return entries.filter((entry) => getEntryDateKey(entry).startsWith(`${month.key}-`));
}
