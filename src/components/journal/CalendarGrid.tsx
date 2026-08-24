import Link from 'next/link';
import { AeroOrb } from '@/components/aero/AeroOrb';
import type { CalendarDay } from '@/lib/journal/analytics';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function dayClassName(day: CalendarDay): string {
  const surface = day.isToday
    ? 'bg-white/90 border-[#3a97e8] shadow-[inset_0_0_8px_rgba(58,151,232,0.35)] ring-2 ring-[#3a97e8]'
    : 'bg-white/50 border-white/75 shadow-2xs hover:bg-white/80';
  return `relative aspect-square min-h-10 min-w-0 rounded-xl border p-1 sm:p-1.5 transition-all ${surface}`;
}

function DayCell({ day }: { day: CalendarDay }) {
  const content = (
    <>
      <span className={`text-xs font-bold sm:text-sm ${day.isToday ? 'text-[#146cc2]' : 'text-[#0a2f5c]'}`}>
        {day.day}
      </span>
      {day.moods.length > 0 ? (
        <div className="absolute bottom-1 right-1 flex max-w-[calc(100%-0.4rem)] gap-0.5 overflow-hidden">
          {day.moods.map((mood, index) => (
            <AeroOrb key={`${day.date}-${index}`} mood={mood} mini />
          ))}
        </div>
      ) : null}
    </>
  );

  if (day.entryIds.length === 0) {
    return (
      <div className={dayClassName(day)} aria-current={day.isToday ? 'date' : undefined}>
        {content}
      </div>
    );
  }

  if (day.entryIds.length === 1) {
    return (
      <Link
        href={`/timeline/${day.entryIds[0]}`}
        className={`${dayClassName(day)} cursor-pointer hover:scale-105 active:scale-95`}
        aria-current={day.isToday ? 'date' : undefined}
        aria-label={`Open journal entry for ${day.date}`}
      >
        {content}
      </Link>
    );
  }

  return (
    <details className={`${dayClassName(day)} group`}>
      <summary
        className="block h-full cursor-pointer list-none rounded-xl focus:outline-none focus-visible:ring-3 focus-visible:ring-[#146cc2]/70"
        aria-label={`${day.entryIds.length} entries for ${day.date}`}
      >
        {content}
      </summary>
      <div className="absolute inset-x-0 top-full z-30 mt-1 min-w-36 rounded-xl border border-white bg-white/95 p-2 text-left shadow-xl backdrop-blur-md">
        <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-[#2b4c73]">{day.entryIds.length} memories</p>
        <ul className="space-y-1">
          {day.entryIds.map((entryId, index) => (
            <li key={entryId}>
              <Link
                href={`/timeline/${entryId}`}
                className="aero-link-control w-full justify-start rounded-lg px-2 py-1 text-xs font-bold text-[#144e9d] hover:bg-sky-50"
              >
                Entry {index + 1} · {day.moods[index] ?? day.moods[0]}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}

export function CalendarGrid({ days }: { days: (CalendarDay | null)[] }) {
  return (
    <>
      <div className="calendar-grid-scroll overflow-x-auto pb-1">
        <div className="calendar-grid-inner min-w-[280px] w-full">
          <div className="mb-1.5 grid grid-cols-7 gap-1 text-center text-[11px] font-bold uppercase tracking-wider text-[#2b4c73]">
            {WEEKDAYS.map((weekday) => <div key={weekday} className="min-w-0">{weekday}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {days.map((day, index) => day ? (
              <DayCell key={day.date} day={day} />
            ) : (
              <div
                key={`empty-${index}`}
                className="aspect-square min-h-10 min-w-0 rounded-xl border border-black/5 bg-black/5"
                aria-hidden="true"
              />
            ))}
          </div>
        </div>
      </div>
      <p className="calendar-grid-scroll-hint text-center text-xs font-semibold text-[#2b4c73]">
        Swipe horizontally to see all days.
      </p>
    </>
  );
}
