'use server';

import { db } from '@/lib/db';
import { verifySession } from '@/lib/dal';
import { listTimelinePage, type TimelinePage } from '@/lib/journal/timeline';

export async function loadTimelinePage(cursor?: string): Promise<TimelinePage> {
  const session = await verifySession();
  return listTimelinePage(db, session.userId, cursor);
}
