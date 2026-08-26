const DATE_KEY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export function isValidDateKey(value: string): boolean {
  if (!DATE_KEY_PATTERN.test(value)) return false;

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

export function getTodayDateKey(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function isFutureDateKey(dateKey: string, now: Date): boolean {
  return dateKey > getTodayDateKey(now);
}

export function formatDateKey(dateKey: string): string {
  if (!isValidDateKey(dateKey)) return '';
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function formatJournalDate(dateKey: string, todayDateKey: string): string {
  const label = formatDateKey(dateKey);
  return dateKey === todayDateKey ? `Today · ${label}` : label;
}
