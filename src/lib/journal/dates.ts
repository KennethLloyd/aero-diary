const MS_PER_MINUTE = 60_000;
const DATE_KEY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export function isValidDateKey(value: string): boolean {
  if (!DATE_KEY_PATTERN.test(value)) return false;

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

export function getDateKey(date: Date, localOffset: number): string {
  return new Date(date.getTime() + localOffset * MS_PER_MINUTE).toISOString().slice(0, 10);
}

export function getTodayDateKey(now = new Date(), localOffset = -now.getTimezoneOffset()): string {
  return getDateKey(now, localOffset);
}

export function getJournalDateTime(
  dateKey: string,
  now: Date,
  localOffset: number,
): Date {
  if (!isValidDateKey(dateKey)) throw new Error('Invalid journal date.');

  const [year, month, day] = dateKey.split('-').map(Number);
  const localNow = new Date(now.getTime() + localOffset * MS_PER_MINUTE);
  const utcMillis = Date.UTC(
    year,
    month - 1,
    day,
    localNow.getUTCHours(),
    localNow.getUTCMinutes(),
    localNow.getUTCSeconds(),
    localNow.getUTCMilliseconds(),
  );

  return new Date(utcMillis - localOffset * MS_PER_MINUTE);
}

export function isFutureDateKey(
  dateKey: string,
  now: Date,
  localOffset: number,
): boolean {
  return dateKey > getTodayDateKey(now, localOffset);
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
