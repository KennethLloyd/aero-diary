import 'server-only';

import { cacheLife, cacheTag } from 'next/cache';
import type { PrismaClient } from '@/generated/prisma/client';
import type { Mood } from '@/generated/prisma/enums';
import { db } from '@/lib/db';
import { timelineCacheTag } from '@/lib/journal/cache-tags';
import { formatDateKey, parseJournalDate, type JournalDate } from '@/lib/journal/dates';
import { normalizeJournalNote } from '@/lib/journal/notes';
import { timelineMoodSchema } from '@/lib/journal/schemas';

export const TIMELINE_PAGE_SIZE = 25;
type TimelineDbEntry = {
  id: string
  journalDate: string
  mood: Mood
  note: string
  activities: { activityId: string; activity: { emoji: string; name: string } }[]
}

export type TimelineEntry = {
  id: string
  journalDate: JournalDate
  date: string
  mood: Mood
  note: string
  tags: { id: string; emoji: string; name: string }[]
}

export type TimelinePage = {
  entries: TimelineEntry[]
  nextCursor: string | null
}

export type TimelineFilter = {
  mood?: Mood
  activityId?: string
}

export function parseTimelineFilter(
  params: { mood?: string | string[]; activity?: string | string[] },
): TimelineFilter {
  const moodValue = Array.isArray(params.mood) ? params.mood[0] : params.mood;
  const activityValue = Array.isArray(params.activity) ? params.activity[0] : params.activity;
  const mood = timelineMoodSchema.safeParse(moodValue);
  const activityId = activityValue?.trim().slice(0, 100);

  return {
    ...(mood.success ? { mood: mood.data } : {}),
    ...(activityId ? { activityId } : {}),
  };
}

function formatEntry(entry: TimelineDbEntry): TimelineEntry {
  const journalDate = parseJournalDate(entry.journalDate);
  return {
    id: entry.id,
    journalDate,
    date: formatDateKey(journalDate),
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
  filter: TimelineFilter = {},
): Promise<TimelinePage> {
  'use cache';
  cacheLife('journal');
  cacheTag(timelineCacheTag(userId));
  return listTimelinePage(db, userId, cursor, filter);
}

export async function listTimelinePage(
  database: PrismaClient,
  userId: string,
  cursor?: string,
  filter: TimelineFilter = {},
): Promise<TimelinePage> {
  const cursorEntry = cursor
    ? await database.entry.findFirst({
      where: { id: cursor, userId },
      select: { id: true, journalDate: true },
    })
    : null;

  if (cursor && !cursorEntry) throw new Error('Invalid timeline cursor.');

  const entries = await database.entry.findMany({
    where: {
      userId,
      ...(filter.mood ? { mood: filter.mood } : {}),
      ...(filter.activityId ? { activities: { some: { activityId: filter.activityId } } } : {}),
      ...(cursorEntry
        ? {
          OR: [
            { journalDate: { lt: cursorEntry.journalDate } },
            { journalDate: cursorEntry.journalDate, id: { lt: cursorEntry.id } },
          ],
        }
        : {}),
    },
    orderBy: [{ journalDate: 'desc' }, { id: 'desc' }],
    take: TIMELINE_PAGE_SIZE + 1,
    select: {
      id: true,
      journalDate: true,
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
