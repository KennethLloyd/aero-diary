import Link from 'next/link'
import { AeroOrb } from '@/components/aero/AeroOrb'
import type { CalendarDay } from '@/lib/journal/analytics'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function dayClassName(day: CalendarDay): string {
  const surface = day.isToday
    ? 'bg-white/80 border-[#4a9be6] shadow-[inset_0_0_10px_rgba(74,155,230,0.3)] ring-2 ring-[#4a9be6]'
    : 'bg-white/40 border-white/60 shadow-sm hover:bg-white/70'
  return `relative aspect-square rounded-lg border p-1.5 transition-colors ${surface}`
}

function DayCell({ day }: { day: CalendarDay }) {
  const content = (
    <>
      <span className={`text-sm font-bold ${day.isToday ? 'text-[#146cc2]' : 'text-[#0a2f5c]'}`}>
        {day.day}
      </span>
      {day.moods.length > 0 ? (
        <div className="absolute bottom-1 right-1 flex max-w-[calc(100%-0.5rem)] gap-0.5">
          {day.moods.map((mood, index) => (
            <AeroOrb key={`${day.date}-${index}`} mood={mood} mini />
          ))}
        </div>
      ) : null}
    </>
  )

  if (day.entryIds.length === 0) {
    return (
      <div className={dayClassName(day)} aria-current={day.isToday ? 'date' : undefined}>
        {content}
      </div>
    )
  }

  return (
    <Link
      href={`/timeline/${day.entryIds[0]}`}
      className={`${dayClassName(day)} cursor-pointer`}
      aria-current={day.isToday ? 'date' : undefined}
      aria-label={`Open journal entry for ${day.date}`}
    >
      {content}
    </Link>
  )
}

export function CalendarGrid({ days }: { days: (CalendarDay | null)[] }) {
  return (
    <>
      <div className="grid grid-cols-7 gap-2 text-center text-xs font-bold uppercase tracking-wider text-[#2b4c73]">
        {WEEKDAYS.map((weekday) => <div key={weekday}>{weekday}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1 sm:gap-2">
        {days.map((day, index) => day ? (
          <DayCell key={day.date} day={day} />
        ) : (
          <div
            key={`empty-${index}`}
            className="aspect-square rounded-lg border border-black/5 bg-black/5"
            aria-hidden="true"
          />
        ))}
      </div>
    </>
  )
}
