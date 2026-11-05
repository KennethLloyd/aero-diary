import 'server-only';

import { ActivityInferenceStatus } from '@/generated/prisma/enums';
import { db } from '@/lib/db';
import { classifyJournalActivities } from '@/lib/journal/activity-classifier';
import { configuredLlmClient } from '@/lib/journal/llm-client-config';
import type { LlmClient } from '@/lib/journal/llm-client';

export type EntryInferenceSnapshot = {
  note: string;
  updatedAt: Date;
};

type InferenceCounts = {
  availableCount: number;
  returnedCount: number;
  invalidCount: number;
  unknownCount: number;
};

type SkippedInference = { activityIds: readonly [] } & (
  | {
      status: 'empty';
      reason:
        | 'blank-note'
        | 'no-active-activities'
        | 'model-returned-none'
        | 'no-usable-ids'
        | 'nothing-to-attach';
    }
  | { status: 'stale'; reason: 'changed-before-classification' | 'changed-before-save' }
  | { status: 'missing'; reason: 'deleted-before-classification' | 'deleted-before-save' }
);

export type EntryInferenceResult = InferenceCounts &
  (SkippedInference | { status: 'attached'; activityIds: string[] });

const COUNTS_NOT_REACHED: InferenceCounts = {
  availableCount: 0,
  returnedCount: 0,
  invalidCount: 0,
  unknownCount: 0,
};

function isCurrentEntry(
  entry: { note: string; updatedAt: Date },
  snapshot: EntryInferenceSnapshot,
): boolean {
  return entry.note === snapshot.note && entry.updatedAt.getTime() === snapshot.updatedAt.getTime();
}

async function completeInference(
  userId: string,
  entryId: string,
  snapshot: EntryInferenceSnapshot,
  status: Extract<ActivityInferenceStatus, 'COMPLETE' | 'FAILED'>,
) {
  await db.entry.updateMany({
    where: {
      id: entryId,
      userId,
      note: snapshot.note,
      updatedAt: snapshot.updatedAt,
      activityInferenceStatus: ActivityInferenceStatus.PENDING,
    },
    data: { activityInferenceStatus: status },
  });
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

  if (!entry) {
    return {
      status: 'missing',
      reason: 'deleted-before-classification',
      activityIds: [],
      ...COUNTS_NOT_REACHED,
    };
  }

  if (!isCurrentEntry(entry, snapshot)) {
    return {
      status: 'stale',
      reason: 'changed-before-classification',
      activityIds: [],
      ...COUNTS_NOT_REACHED,
    };
  }

  if (!snapshot.note.trim()) {
    return { status: 'empty', reason: 'blank-note', activityIds: [], ...COUNTS_NOT_REACHED };
  }

  const activities = await db.activity.findMany({
    where: { userId, isArchived: false },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true },
  });

  if (activities.length === 0) {
    return {
      status: 'empty',
      reason: 'no-active-activities',
      activityIds: [],
      ...COUNTS_NOT_REACHED,
    };
  }

  const classification = await classifyJournalActivities(
    snapshot.note,
    activities,
    client ?? configuredLlmClient(),
  );
  const inferredActivityIds = classification.activityIds;
  const counts: InferenceCounts = {
    availableCount: activities.length,
    returnedCount: classification.returnedCount,
    invalidCount: classification.invalidCount,
    unknownCount: classification.unknownCount,
  };

  if (inferredActivityIds.length === 0) {
    const reason = counts.returnedCount === 0 ? 'model-returned-none' : 'no-usable-ids';

    return { status: 'empty', reason, activityIds: [], ...counts };
  }

  return db.$transaction(async (transaction): Promise<EntryInferenceResult> => {
    const currentEntry = await transaction.entry.findFirst({
      where: { id: entryId, userId },
      select: {
        note: true,
        updatedAt: true,
        activities: { select: { activityId: true } },
      },
    });

    if (!currentEntry) {
      return { status: 'missing', reason: 'deleted-before-save', activityIds: [], ...counts };
    }

    if (!isCurrentEntry(currentEntry, snapshot)) {
      return { status: 'stale', reason: 'changed-before-save', activityIds: [], ...counts };
    }

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
    const activityIdsToAttach = inferredActivityIds.filter(
      (activityId) => validIds.has(activityId) && !attachedIds.has(activityId),
    );

    if (activityIdsToAttach.length === 0) {
      return { status: 'empty', reason: 'nothing-to-attach', activityIds: [], ...counts };
    }

    await transaction.entryActivity.createMany({
      data: activityIdsToAttach.map((activityId) => ({ entryId, activityId })),
    });

    return { status: 'attached', activityIds: activityIdsToAttach, ...counts };
  });
}

function logInferenceFinished(entryId: string, result: EntryInferenceResult) {
  const event = {
    code: 'ACTIVITY_INFERENCE_FINISHED',
    entryId,
    outcome: result.status,
    availableCount: result.availableCount,
    returnedCount: result.returnedCount,
    invalidCount: result.invalidCount,
    unknownCount: result.unknownCount,
    attachedActivityIds: result.activityIds,
  };

  console.info(
    'Automatic activity inference finished.',
    result.status === 'attached' ? event : { ...event, reason: result.reason },
  );
}

// Raw errors can carry journal text: completeInference passes the note in its query.
function sanitizedError(error: unknown) {
  const name = error instanceof Error ? error.name : 'UnknownError';
  const code = error instanceof Error && 'code' in error ? error.code : undefined;

  return typeof code === 'string' || typeof code === 'number' ? { name, code } : { name };
}

export async function runEntryActivityInference(
  userId: string,
  entryId: string,
  snapshot: EntryInferenceSnapshot,
): Promise<void> {
  try {
    const result = await inferEntryActivities(userId, entryId, snapshot);

    logInferenceFinished(entryId, result);

    if (result.status === 'attached' || result.status === 'empty') {
      await completeInference(userId, entryId, snapshot, ActivityInferenceStatus.COMPLETE);
    }
  } catch (error) {
    try {
      await completeInference(userId, entryId, snapshot, ActivityInferenceStatus.FAILED);
    } catch (statusError) {
      console.error('Automatic activity inference status update failed.', {
        entryId,
        error: sanitizedError(statusError),
      });
    }

    console.error('Automatic activity inference failed.', {
      entryId,
      error: sanitizedError(error),
    });
  }
}
