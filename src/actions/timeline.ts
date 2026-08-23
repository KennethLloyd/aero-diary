'use server';

import { verifySession } from '@/lib/dal';
import { getCachedTimelinePage, type TimelinePage } from '@/lib/journal/timeline';

export async function loadTimelinePage(cursor?: string): Promise<TimelinePage> {
  const session = await verifySession();
  return getCachedTimelinePage(session.userId, cursor);
}
