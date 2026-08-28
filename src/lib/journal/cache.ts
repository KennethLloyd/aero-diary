import 'server-only';

import { updateTag } from 'next/cache';
import {
  activityOptionsCacheTag,
  calendarCacheTag,
  entryDetailCacheTag,
  insightsCacheTag,
  timelineCacheTag,
} from '@/lib/journal/cache-tags';

export function invalidateEntryDetailRead(userId: string, entryId: string): void {
  updateTag(entryDetailCacheTag(userId, entryId));
}

export function invalidateJournalReads(userId: string, entryId?: string): void {
  updateTag(timelineCacheTag(userId));
  updateTag(calendarCacheTag(userId));
  updateTag(insightsCacheTag(userId));
  if (entryId) invalidateEntryDetailRead(userId, entryId);
}

export function invalidateActivityReads(userId: string): void {
  updateTag(activityOptionsCacheTag(userId));
  invalidateJournalReads(userId);
}
