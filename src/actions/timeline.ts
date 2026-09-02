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
  const parsed = timelineFilterSchema.safeParse(filter);
  return parsed.success ? parsed.data : {};
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
