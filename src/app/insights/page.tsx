import Link from 'next/link';
import { Suspense } from 'react';
import { AeroBubbles } from '@/components/aero/AeroBubbles';
import { AeroCard } from '@/components/aero/AeroCard';
import { AeroOrb } from '@/components/aero/AeroOrb';
import { AeroPageHeader } from '@/components/aero/AeroPageHeader';
import { AeroScreen } from '@/components/aero/AeroScreen';
import { MonthNavigator } from '@/components/journal/MonthNavigator';
import {
  formatMonthLabel,
  getMonthFromParam,
  MOOD_LABEL,
  MOOD_PROGRESS_CLASS,
  summarizeInsights,
} from '@/lib/journal/analytics';
import { getEntriesForMonthForUser } from '@/lib/journal/queries';
import { verifySession } from '@/lib/dal';

type InsightsPageProps = {
  searchParams: Promise<{ month?: string | string[] | undefined }>
}

export default function InsightsPage({ searchParams }: InsightsPageProps) {
  return (
    <>
      <AeroBubbles />
      <AeroScreen>
        <Suspense fallback={<InsightsLoading />}>
          <InsightsContent searchParams={searchParams} />
        </Suspense>
      </AeroScreen>
    </>
  );
}

async function InsightsContent({ searchParams }: InsightsPageProps) {
  const session = await verifySession();
  const { month: monthParam } = await searchParams;
  const month = getMonthFromParam(monthParam);
  const entries = await getEntriesForMonthForUser(session.userId, month);
  const insights = summarizeInsights(entries);
  const totalMoodCount = insights.moods.reduce((sum, m) => sum + m.count, 0);

  return (
    <main className="aero-page relative z-10 mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-6 md:pt-10">
      <AeroPageHeader title="Insights" subtitle={formatMonthLabel(month)} size="md" />
      <MonthNavigator basePath="/insights" month={month} />

      {/* Hero summary */}
      <AeroCard tier="hero" padded>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-4xl font-bold text-[#0a2f5c] leading-none">{entries.length}</p>
            <p className="mt-1 text-sm font-semibold text-[#2b4c73]">
              {entries.length === 1 ? 'entry' : 'entries'} this month
            </p>
          </div>
          {insights.moods.length > 0 ? (
            (() => {
              const mostCommon = insights.moods.reduce((best, m) => m.count > best.count ? m : best, insights.moods[0]);
              return (
                <Link
                  href={`/timeline?mood=${mostCommon.mood}`}
                  className="flex items-center gap-2 rounded-full border border-white/80 bg-white/60 px-3 py-1.5 shadow-sm transition hover:bg-white/80"
                  aria-label={`Filter timeline by ${MOOD_LABEL[mostCommon.mood]} mood`}
                >
                  <AeroOrb mood={mostCommon.mood} className="!h-7 !w-7 !text-sm" />
                  <span className="text-sm font-bold text-[#0a2f5c]">{MOOD_LABEL[mostCommon.mood]}</span>
                </Link>
              );
            })()
          ) : null}
        </div>
      </AeroCard>

      {/* Mood distribution */}
      <AeroCard tier="card" padded>
        <h2 className="mb-4 text-xs font-bold uppercase tracking-wide text-[#5a7194]">
          Mood distribution
        </h2>
        {totalMoodCount > 0 ? (
          <>
            {/* Stacked bar */}
            <div
              className="flex h-3 w-full overflow-hidden rounded-full border border-white/80 bg-white/30 shadow-inner"
              role="img"
              aria-label={`Mood distribution: ${insights.moods.map((m) => `${MOOD_LABEL[m.mood]} ${m.percentage}%`).join(', ')}`}
            >
              {insights.moods
                .filter((m) => m.count > 0)
                .map((m) => (
                  <div
                    key={m.mood}
                    className={`${MOOD_PROGRESS_CLASS[m.mood]} h-full`}
                    style={{ width: `${m.percentage}%` }}
                  />
                ))}
            </div>
            {/* Legend */}
            <ul className="mt-4 grid grid-cols-5 gap-2">
              {insights.moods.map((m) => (
                <li key={m.mood}>
                  <Link
                    href={`/timeline?mood=${m.mood}`}
                    className="flex flex-col items-center gap-1 rounded-lg p-1 transition hover:bg-white/40"
                    aria-label={`Filter timeline by ${MOOD_LABEL[m.mood]}: ${m.count} ${m.count === 1 ? 'entry' : 'entries'}, ${m.percentage}%`}
                  >
                    <AeroOrb mood={m.mood} className="!h-8 !w-8 !text-base" />
                    <span className="text-[10px] font-bold uppercase tracking-wide text-[#5a7194]">
                      {MOOD_LABEL[m.mood]}
                    </span>
                    <span className="text-sm font-bold text-[#0a2f5c]">
                      {m.percentage}%
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-sm font-semibold text-[#5a7194]">
            Log some entries to see your mood distribution.
          </p>
        )}
      </AeroCard>

      {/* Top activities */}
      <AeroCard tier="card" padded>
        <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-[#5a7194]">
          Top activities
        </h2>
        {insights.activities.length > 0 ? (
          <ul className="grid grid-cols-2 gap-2">
            {insights.activities.map((activity) => (
              <li key={activity.activityId}>
                <Link
                  href={`/timeline?activity=${activity.activityId}`}
                  className="flex items-center gap-2.5 rounded-xl border border-white/70 bg-white/40 p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_1px_2px_rgba(0,0,0,0.04)] transition hover:bg-white/65"
                >
                  <span className="text-2xl drop-shadow-sm" aria-hidden="true">
                    {activity.emoji}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-[#0a2f5c]">{activity.name}</p>
                    <p className="text-xs font-semibold text-[#5a7194]">
                      {activity.count} {activity.count === 1 ? 'entry' : 'entries'}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="space-y-2">
            <p className="text-sm font-semibold text-[#5a7194]">
              Activities will appear here as you tag your entries.
            </p>
            <Link href="/timeline/new" className="aero-btn aero-btn-md inline-flex">
              Write an entry
            </Link>
          </div>
        )}
      </AeroCard>

      {entries.length === 0 ? (
        <AeroCard tier="card" padded>
          <p className="mb-3 text-sm font-semibold text-[#2b4c73]">
            No entries logged for this month yet.
          </p>
          <Link href="/timeline/new" className="aero-btn aero-btn-md inline-flex">
            Write an entry
          </Link>
        </AeroCard>
      ) : null}
    </main>
  );
}

function InsightsLoading() {
  return (
    <main className="aero-page relative z-10 mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-6 md:pt-10" aria-label="Loading insights">
      <p className="text-sm font-semibold text-[#2b4c73]">Loading insights…</p>
      <div className="aero-surface-hero h-32 animate-pulse" />
      <div className="aero-surface-card h-48 animate-pulse" />
      <div className="aero-surface-card h-32 animate-pulse" />
    </main>
  );
}
