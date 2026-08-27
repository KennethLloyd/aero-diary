import { Mood } from '@/generated/prisma/enums';
import { getTodayDateKey, parseJournalDate, type JournalDate } from '@/lib/journal/dates';
import { monthParamSchema } from '@/lib/journal/schemas';

export { getTodayDateKey } from '@/lib/journal/dates';
export type JournalEntry = {
  id: string
  journalDate: JournalDate
  mood: Mood
  activities: {
    activityId: string
    activity: { name: string; emoji: string }
  }[]
}

export type CalendarMonth = {
  key: string
  year: number
  month: number
}

export type CalendarDay = {
  date: JournalDate
  day: number
  isToday: boolean
  entryIds: string[]
  moods: Mood[]
}

export type InsightsSummary = {
  moods: { mood: Mood; count: number; percentage: number }[]
  activities: { activityId: string; name: string; emoji: string; count: number }[]
}

export const MOOD_LABEL: Record<Mood, string> = {
  AWFUL: 'Awful',
  BAD: 'Bad',
  MEH: 'Meh',
  GOOD: 'Good',
  RAD: 'Rad',
};

export const MOOD_EMOJI: Record<Mood, string> = {
  AWFUL: '😭',
  BAD: '😟',
  MEH: '😐',
  GOOD: '😊',
  RAD: '😃',
};

export const MOOD_PROGRESS_CLASS: Record<Mood, string> = {
  AWFUL: 'from-[#d80000] to-[#ff7b7b]',
  BAD: 'from-[#d86c00] to-[#ffc17b]',
  MEH: 'from-[#d8b400] to-[#fff48f]',
  GOOD: 'from-[#00b017] to-[#8fff9c]',
  RAD: 'from-[#00a4b0] to-[#7bffff]',
};

const MOODS: readonly Mood[] = [Mood.AWFUL, Mood.BAD, Mood.MEH, Mood.GOOD, Mood.RAD];

function makeMonth(year: number, month: number): CalendarMonth {
  return {
    key: `${year}-${String(month).padStart(2, '0')}`,
    year,
    month,
  };
}

export function getMonthFromParam(
  value: string | string[] | undefined,
  now = new Date(),
): CalendarMonth {
  const candidate = Array.isArray(value) ? value[0] : value;
  const parsed = monthParamSchema.safeParse(candidate);
  if (!parsed.success) {
    return makeMonth(now.getUTCFullYear(), now.getUTCMonth() + 1);
  }

  const [yearString, monthString] = parsed.data.split('-');
  const year = Number(yearString);
  const month = Number(monthString);

  return makeMonth(year, month);
}

export function getPreviousMonth(month: CalendarMonth): CalendarMonth {
  const previous = new Date(Date.UTC(month.year, month.month - 2, 1));
  return makeMonth(previous.getUTCFullYear(), previous.getUTCMonth() + 1);
}

export function getNextMonth(month: CalendarMonth): CalendarMonth {
  const next = new Date(Date.UTC(month.year, month.month, 1));
  return makeMonth(next.getUTCFullYear(), next.getUTCMonth() + 1);
}

export function formatMonthLabel(month: CalendarMonth): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(month.year, month.month - 1, 1)));
}

export function buildCalendarGrid(
  entries: JournalEntry[],
  month: CalendarMonth,
  today = getTodayDateKey(),
): (CalendarDay | null)[] {
  const entriesByDate = new Map<string, { entryIds: string[]; moods: Mood[] }>();

  for (const entry of entries) {
    const date = entry.journalDate;
    if (!date.startsWith(`${month.key}-`)) continue;

    const current = entriesByDate.get(date) ?? { entryIds: [], moods: [] };
    current.entryIds.push(entry.id);
    current.moods.push(entry.mood);
    entriesByDate.set(date, current);
  }

  const firstWeekday = new Date(Date.UTC(month.year, month.month - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(month.year, month.month, 0)).getUTCDate();
  const cellCount = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;

  return Array.from({ length: cellCount }, (_, index) => {
    const day = index - firstWeekday + 1;
    if (day < 1 || day > daysInMonth) return null;

    const date = parseJournalDate(`${month.key}-${String(day).padStart(2, '0')}`);
    const logged = entriesByDate.get(date);
    return {
      date,
      day,
      isToday: date === today,
      entryIds: logged?.entryIds ?? [],
      moods: logged?.moods ?? [],
    };
  });
}

export function summarizeInsights(entries: JournalEntry[]): InsightsSummary {
  const moodCounts = new Map<Mood, number>(MOODS.map((mood) => [mood, 0]));
  const activityCounts = new Map<
    string,
    { activityId: string; name: string; emoji: string; count: number }
  >();

  for (const entry of entries) {
    moodCounts.set(entry.mood, (moodCounts.get(entry.mood) ?? 0) + 1);
    for (const { activityId, activity } of entry.activities) {
      const current = activityCounts.get(activityId);
      activityCounts.set(activityId, {
        activityId,
        name: activity.name,
        emoji: activity.emoji,
        count: (current?.count ?? 0) + 1,
      });
    }
  }

  return {
    moods: MOODS.map((mood) => {
      const count = moodCounts.get(mood) ?? 0;
      return {
        mood,
        count,
        percentage: entries.length === 0 ? 0 : Math.round((count / entries.length) * 100),
      };
    }),
    activities: [...activityCounts.values()].sort(
      (a, b) => b.count - a.count || a.name.localeCompare(b.name),
    ),
  };
}
