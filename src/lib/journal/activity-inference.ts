import 'server-only';

import { db } from '@/lib/db';
import { invalidateJournalReads } from '@/lib/journal/cache';
import { classifyJournalActivities } from '@/lib/journal/activity-classifier';
import { configuredLlmClient } from '@/lib/journal/llm-client-config';
import type { LlmClient } from '@/lib/journal/llm-client';

export type EntryInferenceSnapshot = {
  note: string
  updatedAt: Date
};

export type EntryInferenceResult =
  | { status: 'missing' | 'stale' | 'empty'; activityIds: readonly [] }
  | { status: 'attached'; activityIds: string[] };

function isCurrentEntry(
  entry: { note: string; updatedAt: Date },
  snapshot: EntryInferenceSnapshot,
): boolean {
  return entry.note === snapshot.note && entry.updatedAt.getTime() === snapshot.updatedAt.getTime();
}

export async function inferEntryActivities(
  userId: string,
  entryId: string,
  snapshot: EntryInferenceSnapshot,
  client?: LlmClient,
): Promise<EntryInferenceResult> {
  const entry = await db.entry.findFirst({
    where: { id: entryId, userId },
    select: { note: true, updatedAt: true },
  });
  if (!entry) return { status: 'missing', activityIds: [] };
  if (!isCurrentEntry(entry, snapshot)) return { status: 'stale', activityIds: [] };

  const activities = await db.activity.findMany({
    where: { userId, isArchived: false },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true },
  });
  if (activities.length === 0) return { status: 'empty', activityIds: [] };

  const inferredActivityIds = await classifyJournalActivities(
    snapshot.note,
    activities,
    client ?? configuredLlmClient(),
  );
  if (inferredActivityIds.length === 0) return { status: 'empty', activityIds: [] };

  const result = await db.$transaction(async (transaction) => {
    const currentEntry = await transaction.entry.findFirst({
      where: { id: entryId, userId },
      select: {
        note: true,
        updatedAt: true,
        activities: { select: { activityId: true } },
      },
    });
    if (!currentEntry) return { status: 'missing', activityIds: [] } as const;
    if (!isCurrentEntry(currentEntry, snapshot)) return { status: 'stale', activityIds: [] } as const;

    const validActivities = await transaction.activity.findMany({
      where: {
        id: { in: inferredActivityIds },
        userId,
        isArchived: false,
      },
      select: { id: true },
    });
    const validIds = new Set(validActivities.map((activity) => activity.id));
    const attachedIds = new Set(currentEntry.activities.map((activity) => activity.activityId));
    const activityIdsToAttach = inferredActivityIds.filter((activityId) => (
      validIds.has(activityId) && !attachedIds.has(activityId)
    ));

    if (activityIdsToAttach.length === 0) return { status: 'empty', activityIds: [] } as const;

    await transaction.entryActivity.createMany({
      data: activityIdsToAttach.map((activityId) => ({ entryId, activityId })),
    });
    return { status: 'attached', activityIds: activityIdsToAttach } as const;
  });

  if (result.status === 'attached') invalidateJournalReads(userId, entryId);
  return result;
}

export async function runEntryActivityInference(
  userId: string,
  entryId: string,
  snapshot: EntryInferenceSnapshot,
): Promise<void> {
  try {
    await inferEntryActivities(userId, entryId, snapshot);
  } catch (error) {
    console.error('Automatic activity inference failed.', error);
  }
}
