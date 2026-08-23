import 'server-only';

import { cacheLife, cacheTag } from 'next/cache';
import type { PrismaClient } from '@/generated/prisma/client';
import type { Mood } from '@/generated/prisma/enums';
import { db } from '@/lib/db';
import { timelineCacheTag } from '@/lib/journal/cache-tags';
import { normalizeJournalNote } from '@/lib/journal/notes';

export const TIMELINE_PAGE_SIZE = 25;

type TimelineDbEntry = {
  id: string
  date: Date
  localOffset: number
  mood: Mood
  note: string
  activities: { activityId: string; activity: { emoji: string; name: string } }[]
}

export type TimelineEntry = {
  id: string
  date: string
  dateTime: string
  time: string
  mood: Mood
  note: string
  tags: { id: string; emoji: string; name: string }[]
}

export type TimelinePage = {
  entries: TimelineEntry[]
  nextCursor: string | null
}

function formatEntry(entry: TimelineDbEntry): TimelineEntry {
  const local = new Date(entry.date.getTime() + entry.localOffset * 60_000);
  const dateFormatter = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
  const timeFormatter = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
  });

  return {
    id: entry.id,
    date: dateFormatter.format(local),
    dateTime: entry.date.toISOString(),
    time: timeFormatter.format(local),
    mood: entry.mood,
    note: normalizeJournalNote(entry.note),
    tags: entry.activities.map((activity) => ({
      id: activity.activityId,
      emoji: activity.activity.emoji,
      name: activity.activity.name,
    })),
  };
}

export async function getCachedTimelinePage(
  userId: string,
  cursor?: string,
): Promise<TimelinePage> {
  'use cache';
  cacheLife('journal');
  cacheTag(timelineCacheTag(userId));
  return listTimelinePage(db, userId, cursor);
}

export async function listTimelinePage(
  database: PrismaClient,
  userId: string,
  cursor?: string,
): Promise<TimelinePage> {
  const cursorEntry = cursor
    ? await database.entry.findFirst({
      where: { id: cursor, userId },
      select: { id: true, date: true },
    })
    : null;

  if (cursor && !cursorEntry) throw new Error('Invalid timeline cursor.');

  const entries = await database.entry.findMany({
    where: {
      userId,
      ...(cursorEntry
        ? {
          OR: [
            { date: { lt: cursorEntry.date } },
            { date: cursorEntry.date, id: { lt: cursorEntry.id } },
          ],
        }
        : {}),
    },
    orderBy: [{ date: 'desc' }, { id: 'desc' }],
    take: TIMELINE_PAGE_SIZE + 1,
    select: {
      id: true,
      date: true,
      localOffset: true,
      mood: true,
      note: true,
      activities: {
        select: {
          activityId: true,
          activity: { select: { name: true, emoji: true } },
        },
      },
    },
  });

  const hasMore = entries.length > TIMELINE_PAGE_SIZE;
  const pageEntries = entries.slice(0, TIMELINE_PAGE_SIZE);

  return {
    entries: pageEntries.map(formatEntry),
    nextCursor: hasMore ? pageEntries.at(-1)?.id ?? null : null,
  };
}
