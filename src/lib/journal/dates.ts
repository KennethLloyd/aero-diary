const DATE_KEY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export type JournalDate = string & { readonly __journalDateBrand: unique symbol };

export function isValidDateKey(value: string): boolean {
  if (!DATE_KEY_PATTERN.test(value)) return false;

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

export function parseJournalDate(value: string): JournalDate {
  if (!isValidDateKey(value)) throw new Error('Invalid journal date.');
  return value as JournalDate;
}

export function journalDateFromDate(date: Date): JournalDate {
  return parseJournalDate(date.toISOString().slice(0, 10));
}
export function addJournalDays(dateKey: JournalDate, days: number): JournalDate {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return journalDateFromDate(date);
}


export function getTodayDateKey(now = new Date()): JournalDate {
  return journalDateFromDate(now);
}

export function isFutureDateKey(dateKey: JournalDate, now: Date): boolean {
  return dateKey > getTodayDateKey(now);
}

export function formatDateKey(dateKey: JournalDate): string {
  if (!isValidDateKey(dateKey)) return '';
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function formatJournalDate(dateKey: JournalDate, todayDateKey: JournalDate): string {
  const label = formatDateKey(dateKey);
  return dateKey === todayDateKey ? `Today · ${label}` : label;
}
