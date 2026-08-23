export function timelineCacheTag(userId: string): string {
  return `journal:${userId}:timeline`;
}

export function entryDetailCacheTag(userId: string, entryId: string): string {
  return `journal:${userId}:entry:${entryId}`;
}

export function activityOptionsCacheTag(userId: string): string {
  return `journal:${userId}:activities`;
}

export function calendarCacheTag(userId: string): string {
  return `journal:${userId}:calendar`;
}

export function insightsCacheTag(userId: string): string {
  return `journal:${userId}:insights`;
}
