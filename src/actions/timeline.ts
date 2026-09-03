'use server';

import { verifySession } from '@/lib/dal';
import {
  getCachedTimelinePage,
  getFreshTimelinePageForUser,
  type TimelineFilter,
  type TimelinePage,
} from '@/lib/journal/timeline';
import {
  getEntryActivityInferenceStatusForUser,
  type EntryActivityInferenceStatus,
} from '@/lib/journal/queries';
import { entryIdSchema, timelineFilterSchema } from '@/lib/journal/schemas';

function parseTimelineActionFilter(filter: TimelineFilter): TimelineFilter {
  const mood = timelineFilterSchema.shape.mood.safeParse(filter.mood);
  const activityId = timelineFilterSchema.shape.activityId.safeParse(filter.activityId);
  const query = timelineFilterSchema.shape.query.safeParse(filter.query);

  return {
    ...(mood.success ? { mood: mood.data } : {}),
    ...(activityId.success ? { activityId: activityId.data } : {}),
    ...(query.success ? { query: query.data } : {}),
  };
}

export async function loadTimelinePage(
  cursor?: string,
  filter: TimelineFilter = {},
): Promise<TimelinePage> {
  const session = await verifySession();
  return getCachedTimelinePage(session.userId, cursor, parseTimelineActionFilter(filter));
}

export async function refreshTimelinePage(
  filter: TimelineFilter = {},
): Promise<TimelinePage> {
  const session = await verifySession();
  return getFreshTimelinePageForUser(session.userId, undefined, parseTimelineActionFilter(filter));
}

export async function getEntryActivityInferenceStatus(
  entryId: string,
): Promise<EntryActivityInferenceStatus> {
  const session = await verifySession();
  const parsedId = entryIdSchema.safeParse(entryId);
  if (!parsedId.success) return 'complete';
  return getEntryActivityInferenceStatusForUser(session.userId, parsedId.data);
}
