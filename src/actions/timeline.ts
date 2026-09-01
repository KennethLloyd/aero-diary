'use server';

import { verifySession } from '@/lib/dal';
import {
  getCachedTimelinePage,
  type TimelineFilter,
  type TimelinePage,
} from '@/lib/journal/timeline';

export async function loadTimelinePage(
  cursor?: string,
  filter: TimelineFilter = {},
  reconcileEntryIds: readonly string[] = [],
): Promise<TimelinePage> {
  const session = await verifySession();
  return getCachedTimelinePage(session.userId, cursor, filter, reconcileEntryIds);
}
