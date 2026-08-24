import Link from 'next/link';
import { Suspense } from 'react';
import { AeroBubbles } from '@/components/aero/AeroBubbles';
import { AeroCard } from '@/components/aero/AeroCard';
import { AeroOrb } from '@/components/aero/AeroOrb';
import { AeroPageHeader } from '@/components/aero/AeroPageHeader';
import { AeroScreen } from '@/components/aero/AeroScreen';
import { CalendarGrid } from '@/components/journal/CalendarGrid';
import { MonthNavigator } from '@/components/journal/MonthNavigator';
import {
  buildCalendarGrid,
  formatMonthLabel,
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
    <main className="aero-page relative z-10 mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-6 md:pt-10">
      <AeroPageHeader title="Calendar" subtitle={formatMonthLabel(month)} size="md" />
      <MonthNavigator basePath="/calendar" month={month} />

      <AeroCard tier="card" padded>
        <CalendarGrid days={days} />
      </AeroCard>

      <AeroCard tier="plain" padded>
        <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-[#5a7194]">
          Mood legend
        </h3>
        <ul className="grid grid-cols-5 gap-2">
          {[Mood.AWFUL, Mood.BAD, Mood.MEH, Mood.GOOD, Mood.RAD].map((mood) => (
            <li key={mood} className="flex flex-col items-center gap-1">
              <AeroOrb mood={mood} mini className="cursor-default" />
              <span className="text-[10px] font-bold uppercase tracking-wide text-[#5a7194]">
                {MOOD_LABEL[mood]}
              </span>
            </li>
          ))}
        </ul>
      </AeroCard>

      {entries.length === 0 ? (
        <AeroCard tier="card" padded>
          <p className="mb-3 text-sm font-semibold text-[#2b4c73]">
            No memories logged this month.
          </p>
          <Link href="/timeline/new" className="aero-btn aero-btn-md inline-flex">
            New entry
          </Link>
        </AeroCard>
      ) : null}
    </main>
  );
}

function CalendarLoading() {
  return (
    <main className="aero-page relative z-10 mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-6 md:pt-10" aria-label="Loading calendar">
      <p className="text-sm font-semibold text-[#2b4c73]">Loading calendar…</p>
      <div className="aero-surface-card h-96 animate-pulse" />
    </main>
  );
}
