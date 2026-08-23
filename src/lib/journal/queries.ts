import 'server-only';

import { cacheLife, cacheTag } from 'next/cache';
import { db } from '@/lib/db';
import { verifySession } from '@/lib/dal';
import type { Mood } from '@/generated/prisma/enums';
import {
  getEntryDateKey,
  type CalendarMonth,
  type JournalEntry,
} from '@/lib/journal/analytics';
import {
  activityOptionsCacheTag,
  calendarCacheTag,
  entryDetailCacheTag,
  insightsCacheTag,
} from '@/lib/journal/cache-tags';
import type { ActivityOption } from '@/lib/journal/types';

export type EntryDetailView = {
  id: string
  date: string
  localOffset: number
  mood: Mood
  note: string
  activities: { activityId: string; activity: { emoji: string; name: string } }[]
  photos: { id: string }[]
}

export async function getActivitiesForUser(userId: string): Promise<ActivityOption[]> {
  'use cache';
  cacheLife('journal');
  cacheTag(activityOptionsCacheTag(userId));

  const activities = await db.activity.findMany({
    where: { userId, isArchived: false },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true, emoji: true },
  });
  return activities.map((activity) => ({ ...activity }));
}

export async function getArchivedActivitiesForUser(userId: string): Promise<ActivityOption[]> {
  'use cache';
  cacheLife('journal');
  cacheTag(activityOptionsCacheTag(userId));

  const activities = await db.activity.findMany({
    where: { userId, isArchived: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true, emoji: true },
  });
  return activities.map((activity) => ({ ...activity }));
}

export async function listActivities(): Promise<ActivityOption[]> {
  const session = await verifySession();
  return getActivitiesForUser(session.userId);
}

export async function getEntriesForMonthForUser(
  userId: string,
  month: CalendarMonth,
): Promise<JournalEntry[]> {
  'use cache';
  cacheLife('journal');
  cacheTag(calendarCacheTag(userId), insightsCacheTag(userId));

  const entries = await db.entry.findMany({
    where: { userId },
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

  return entries
    .filter((entry) => getEntryDateKey(entry).startsWith(`${month.key}-`))
    .map((entry) => ({
      id: entry.id,
      date: new Date(entry.date),
      localOffset: entry.localOffset,
      mood: entry.mood,
      activities: entry.activities.map((activity) => ({
        activityId: activity.activityId,
        activity: { ...activity.activity },
      })),
    }));
}

export async function listEntriesForMonth(month: CalendarMonth): Promise<JournalEntry[]> {
  const session = await verifySession();
  return getEntriesForMonthForUser(session.userId, month);
}

export async function getEntryDetailForUser(
  userId: string,
  entryId: string,
): Promise<EntryDetailView | null> {
  'use cache';
  cacheLife('journal');
  cacheTag(entryDetailCacheTag(userId, entryId));

  const entry = await db.entry.findFirst({
    where: { id: entryId, userId },
    include: {
      activities: { include: { activity: true } },
      photos: { orderBy: { createdAt: 'asc' } },
    },
  });
  if (!entry) return null;

  return {
    id: entry.id,
    date: entry.date.toISOString(),
    localOffset: entry.localOffset,
    mood: entry.mood,
    note: entry.note,
    activities: entry.activities.map(({ activityId, activity }) => ({
      activityId,
      activity: { emoji: activity.emoji, name: activity.name },
    })),
    photos: entry.photos.map(({ id }) => ({ id })),
  };
}
