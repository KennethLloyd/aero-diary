import Link from 'next/link';
import { Suspense } from 'react';
import { AeroBubbles } from '@/components/aero/AeroBubbles';
import { AeroScreen } from '@/components/aero/AeroScreen';
import { AeroOrb } from '@/components/aero/AeroOrb';
import { AeroTitle } from '@/components/aero/AeroTitle';
import { CalendarGrid } from '@/components/journal/CalendarGrid';
import { MonthNavigator } from '@/components/journal/MonthNavigator';
import {
  buildCalendarGrid,
  getMonthFromParam,
  MOOD_LABEL,
} from '@/lib/journal/analytics';
import { Mood } from '@/generated/prisma/enums';
import { getEntriesForMonthForUser } from '@/lib/journal/queries';
import { verifySession } from '@/lib/dal';

type CalendarPageProps = {
  searchParams: Promise<{ month?: string | string[] | undefined }>
}

export default function CalendarPage({ searchParams }: CalendarPageProps) {
  return (
    <>
      <AeroBubbles />
      <AeroScreen>
        <Suspense fallback={<CalendarLoading />}>
          <CalendarContent searchParams={searchParams} />
        </Suspense>
      </AeroScreen>
    </>
  );
}

async function CalendarContent({ searchParams }: CalendarPageProps) {
  const session = await verifySession();
  const { month: monthParam } = await searchParams;
  const month = getMonthFromParam(monthParam);
  const entries = await getEntriesForMonthForUser(session.userId, month);
  const days = buildCalendarGrid(entries, month);

  return (
    <main className="aero-page relative z-10 mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-4 sm:py-6 md:pt-8">
      <header className="flex flex-col gap-2.5 px-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <AeroTitle>Calendar</AeroTitle>
          <p className="text-xs font-semibold text-[#2b4c73] drop-shadow-2xs">
            Monthly Overview
          </p>
        </div>
        <div className="w-full sm:w-auto">
          <MonthNavigator basePath="/calendar" month={month} />
        </div>
      </header>

      <section className="aero-card flex flex-col gap-4 p-4 sm:p-5" aria-labelledby="calendar-heading">
        <h2 id="calendar-heading" className="sr-only">Calendar for selected month</h2>
        <CalendarGrid days={days} />

        {/* Mood legend */}
        <div className="rounded-xl border border-white/70 bg-white/45 p-3" aria-label="Mood legend">
          <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[#0a2f5c]">Mood legend</h3>
          <div className="grid grid-cols-5 gap-1 text-center text-[10px] font-bold text-[#2b4c73] sm:text-xs">
            {[Mood.AWFUL, Mood.BAD, Mood.MEH, Mood.GOOD, Mood.RAD].map((mood) => (
              <div key={mood} className="flex flex-col items-center gap-1">
                <AeroOrb mood={mood} mini className="cursor-default" />
                <span>{MOOD_LABEL[mood]}</span>
              </div>
            ))}
          </div>
        </div>

        {entries.length === 0 ? (
          <div className="recovery-state rounded-xl p-4 text-center">
            <p className="text-xs font-semibold text-[#2b4c73]">No memories logged for this month yet.</p>
            <Link href="/timeline/new" className="aero-btn mt-2.5 text-xs">
              + Write an entry
            </Link>
          </div>
        ) : null}
      </section>
    </main>
  );
}

function CalendarLoading() {
  return (
    <main className="aero-page relative z-10 mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-4 sm:py-6 md:pt-8" aria-label="Loading calendar">
      <p className="text-xs font-semibold text-[#2b4c73]">Loading calendar…</p>
      <div className="aero-card h-96 animate-pulse p-4" />
    </main>
  );
}
