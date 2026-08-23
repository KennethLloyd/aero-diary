import Link from 'next/link';
import { Suspense } from 'react';
import { AeroBubbles } from '@/components/aero/AeroBubbles';
import { AeroDock } from '@/components/aero/AeroDock';
import { AeroTitle } from '@/components/aero/AeroTitle';
import { CalendarGrid } from '@/components/journal/CalendarGrid';
import { MonthNavigator } from '@/components/journal/MonthNavigator';
import {
  buildCalendarGrid,
  getMonthFromParam,
  MOOD_EMOJI,
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
      <Suspense fallback={<CalendarLoading />}>
        <CalendarContent searchParams={searchParams} />
      </Suspense>
      <AeroDock />
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
    <main className="aero-page relative z-10 mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-6 md:pt-10">
        <header className="px-2">
          <AeroTitle>Calendar</AeroTitle>
          <p className="mt-1 text-sm font-semibold text-[#2b4c73] drop-shadow">
            Monthly Overview
          </p>
        </header>

        <section className="aero-glass flex flex-col gap-4 p-4" aria-labelledby="calendar-heading">
          <h2 id="calendar-heading" className="sr-only">Calendar for selected month</h2>
          <MonthNavigator basePath="/calendar" month={month} />
          <CalendarGrid days={days} />
          <div className="rounded-lg border border-white/60 bg-white/35 p-3" aria-label="Mood legend">
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-[#0a2f5c]">Mood legend</h3>
            <div className="grid grid-cols-5 gap-1 text-center text-[10px] font-bold text-[#2b4c73] sm:text-xs">
              {[Mood.AWFUL, Mood.BAD, Mood.MEH, Mood.GOOD, Mood.RAD].map((mood) => (
                <div key={mood} className="flex flex-col items-center gap-1">
                  <span aria-hidden="true">{MOOD_EMOJI[mood]}</span>
                  <span>{MOOD_LABEL[mood]}</span>
                </div>
              ))}
            </div>
          </div>
          <p className="text-center text-xs font-semibold text-[#2b4c73]">
            Tap a day with one orb to open its entry. Days with several orbs list every entry.
          </p>
          {entries.length === 0 ? (
            <div className="recovery-state rounded-lg p-4 text-center">
              <p className="text-sm font-semibold text-[#2b4c73]">No memories logged this month.</p>
              <Link href="/timeline/new" className="aero-btn mt-3">New entry</Link>
            </div>
          ) : null}
        </section>
    </main>
  );
}

function CalendarLoading() {
  return (
    <main className="aero-page relative z-10 mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-6 md:pt-10" aria-label="Loading calendar">
      <p className="text-sm font-semibold text-[#2b4c73]">Loading calendar…</p>
      <div className="aero-glass h-96 animate-pulse p-4" />
    </main>
  );
}
