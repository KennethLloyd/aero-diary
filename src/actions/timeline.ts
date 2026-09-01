'use server';

import { verifySession } from '@/lib/dal';
import { db } from '@/lib/db';
import {
  getCachedTimelinePage,
  listTimelinePage,
  type TimelineFilter,
  type TimelinePage,
} from '@/lib/journal/timeline';

export async function loadTimelinePage(
  cursor?: string,
  filter: TimelineFilter = {},
  reconcileEntryIds: readonly string[] = [],
): Promise<TimelinePage> {
  const session = await verifySession();
  if (reconcileEntryIds.length > 0) {
    return listTimelinePage(db, session.userId, cursor, filter, reconcileEntryIds);
  }
  return getCachedTimelinePage(session.userId, cursor, filter);
}
