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
    <div className="aero-month-nav">
      <Link href={`${basePath}?month=${previousMonth.key}`} className="aero-icon-btn" aria-label="Previous month">
        <span aria-hidden="true">‹</span>
      </Link>
      <span className="aero-month-label">{formatMonthLabel(month)}</span>
      <Link href={`${basePath}?month=${nextMonth.key}`} className="aero-icon-btn" aria-label="Next month">
        <span aria-hidden="true">›</span>
      </Link>
    </div>
  );
}
