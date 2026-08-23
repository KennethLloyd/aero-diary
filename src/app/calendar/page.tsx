import { Suspense } from 'react';
import { AeroBubbles } from '@/components/aero/AeroBubbles';
import { AeroDock } from '@/components/aero/AeroDock';
import { AeroTitle } from '@/components/aero/AeroTitle';
import { CalendarGrid } from '@/components/journal/CalendarGrid';
import { MonthNavigator } from '@/components/journal/MonthNavigator';
import {
  buildCalendarGrid,
  getMonthFromParam,
} from '@/lib/journal/analytics';
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
    <main className="aero-page relative z-10 mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-6 pb-32 md:pt-10 md:pb-32">
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
          <p className="text-center text-xs font-semibold text-[#2b4c73]">
            Tap a day with a mood orb to open its entry.
          </p>
        </section>
    </main>
  );
}

function CalendarLoading() {
  return (
    <main className="aero-page relative z-10 mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-6 pb-32 md:pt-10 md:pb-32" aria-label="Loading calendar">
      <div className="h-12 w-40 animate-pulse rounded-xl bg-white/50" />
      <div className="aero-glass h-96 animate-pulse p-4" />
    </main>
  );
}
