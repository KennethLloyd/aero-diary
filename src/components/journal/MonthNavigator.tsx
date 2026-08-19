import Link from 'next/link'
import {
  formatMonthLabel,
  getNextMonth,
  getPreviousMonth,
  type CalendarMonth,
} from '@/lib/journal/analytics'

export function MonthNavigator({
  basePath,
  month,
}: {
  basePath: string
  month: CalendarMonth
}) {
  const previousMonth = getPreviousMonth(month)
  const nextMonth = getNextMonth(month)

  return (
    <div className="flex items-center justify-between rounded-full border border-white/60 bg-white/30 px-3 py-1.5 shadow-inner">
      <Link
        href={`${basePath}?month=${previousMonth.key}`}
        className="aero-btn flex h-8 w-8 items-center justify-center rounded-full p-0 text-lg"
        aria-label="Previous month"
      >
        ‹
      </Link>
      <span className="text-lg font-bold text-[#0a2f5c] drop-shadow-sm">
        {formatMonthLabel(month)}
      </span>
      <Link
        href={`${basePath}?month=${nextMonth.key}`}
        className="aero-btn flex h-8 w-8 items-center justify-center rounded-full p-0 text-lg"
        aria-label="Next month"
      >
        ›
      </Link>
    </div>
  )
}
