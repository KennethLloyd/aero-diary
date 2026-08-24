import Link from 'next/link';
import {
  formatMonthLabel,
  getNextMonth,
  getPreviousMonth,
  type CalendarMonth,
} from '@/lib/journal/analytics';

export function MonthNavigator({
  basePath,
  month,
}: {
  basePath: string
  month: CalendarMonth
}) {
  const previousMonth = getPreviousMonth(month);
  const nextMonth = getNextMonth(month);

  return (
    <div className="flex items-center justify-between gap-2">
      <Link
        href={`${basePath}?month=${previousMonth.key}`}
        aria-label="Previous month"
        className="flex h-9 w-9 items-center justify-center rounded-full border border-white/80 bg-white/55 text-[#0a2f5c] shadow-[0_1px_2px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.85)] transition hover:bg-white/80"
      >
        <span className="text-base font-bold" aria-hidden="true">‹</span>
      </Link>
      <span className="text-base font-bold text-[#0a2f5c] drop-shadow-sm">
        {formatMonthLabel(month)}
      </span>
      <Link
        href={`${basePath}?month=${nextMonth.key}`}
        aria-label="Next month"
        className="flex h-9 w-9 items-center justify-center rounded-full border border-white/80 bg-white/55 text-[#0a2f5c] shadow-[0_1px_2px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.85)] transition hover:bg-white/80"
      >
        <span className="text-base font-bold" aria-hidden="true">›</span>
      </Link>
    </div>
  );
}
