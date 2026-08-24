import Link from 'next/link';
import { Suspense } from 'react';
import { AeroBubbles } from '@/components/aero/AeroBubbles';
import { AeroScreen } from '@/components/aero/AeroScreen';
import { AeroTitle } from '@/components/aero/AeroTitle';
import { AeroOrb } from '@/components/aero/AeroOrb';
import { MonthNavigator } from '@/components/journal/MonthNavigator';
import {
  getMonthFromParam,
  MOOD_EMOJI,
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
  const mostCommonMood = insights.moods.reduce((best, mood) => mood.count > best.count ? mood : best, insights.moods[0]);

  return (
    <main className="aero-page relative z-10 mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-4 sm:py-6 md:pt-8">
      <header className="flex flex-col gap-2.5 px-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <AeroTitle>Insights</AeroTitle>
          <p className="text-xs font-semibold text-[#2b4c73] drop-shadow-2xs">
            Trends &amp; Patterns
          </p>
        </div>
        <div className="w-full sm:w-auto" aria-label="Insights month navigation">
          <MonthNavigator basePath="/insights" month={month} />
        </div>
      </header>

      {/* 1. Hero Summary Card */}
      <section className="aero-hero p-5 sm:p-6" aria-label="Monthly insight summary">
        <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-[#2b4c73]">
              Monthly Summary
            </span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-4xl font-extrabold tracking-tight text-[#0a2f5c]">
                {entries.length}
              </span>
              <span className="text-sm font-semibold text-[#2b4c73]">
                {entries.length === 1 ? 'memory logged' : 'memories logged'}
              </span>
            </div>
            {entries.length > 0 && mostCommonMood ? (
              <p className="mt-2 text-xs font-medium text-[#1a2c42]">
                Your predominant mood was <strong className="font-bold text-[#0a2f5c]">{MOOD_LABEL[mostCommonMood.mood]}</strong> with {mostCommonMood.count} {mostCommonMood.count === 1 ? 'entry' : 'entries'}.
              </p>
            ) : (
              <p className="mt-2 text-xs font-medium text-[#2b4c73]">
                No memories logged for this month yet.
              </p>
            )}
          </div>

          {entries.length > 0 && mostCommonMood ? (
            <div className="flex items-center gap-3 rounded-2xl border border-white/80 bg-white/50 p-3 shadow-inner">
              <AeroOrb mood={mostCommonMood.mood} className="h-12 w-12 text-2xl shadow-md" />
              <div className="text-left">
                <span className="block text-[11px] font-bold uppercase text-[#2b4c73]">Dominant</span>
                <span className="text-sm font-bold text-[#0a2f5c]">{MOOD_LABEL[mostCommonMood.mood]}</span>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      {/* 2. Mood Distribution */}
      <section className="aero-card space-y-4 p-5" aria-labelledby="mood-distribution-heading">
        <div className="relative z-10">
          <div className="flex items-center justify-between border-b border-white/60 pb-2.5">
            <h2 id="mood-distribution-heading" className="text-sm font-bold uppercase tracking-wider text-[#0a2f5c]">
              Mood Distribution
            </h2>
            <span className="text-xs font-semibold text-[#2b4c73]">
              {entries.length} total
            </span>
          </div>

          <div className="mt-4 space-y-3.5">
            {insights.moods.map(({ mood, count, percentage }) => (
              <div key={mood} className="group">
                <div className="mb-1 flex items-center justify-between text-xs font-bold text-[#1a3c63]">
                  <Link
                    href={`/timeline?mood=${mood}`}
                    className="inline-flex items-center gap-1.5 hover:underline"
                  >
                    <span>{MOOD_EMOJI[mood]}</span>
                    <span>{MOOD_LABEL[mood]}</span>
                  </Link>
                  <span className="font-semibold text-[#2b4c73]" aria-label={`${count} entries`}>
                    {count} ({percentage}%)
                  </span>
                </div>
                <div
                  className="aero-progress-track"
                  role="progressbar"
                  aria-label={`${MOOD_LABEL[mood]} mood distribution`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={percentage}
                >
                  <div
                    className={`aero-progress-fill bg-gradient-to-r ${MOOD_PROGRESS_CLASS[mood]}`}
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          {entries.length === 0 ? (
            <div className="mt-4 rounded-xl border border-white/60 bg-white/40 p-4 text-center">
              <p className="text-xs font-semibold text-[#2b4c73]">Log your thoughts to see mood patterns.</p>
              <Link href="/timeline/new" className="aero-btn mt-3 text-xs">
                + Write an entry
              </Link>
            </div>
          ) : null}
        </div>
      </section>

      {/* 3. Top Activities */}
      <section className="aero-card p-5" aria-labelledby="top-activities-heading">
        <div className="relative z-10">
          <div className="flex items-center justify-between border-b border-white/60 pb-2.5">
            <h2 id="top-activities-heading" className="text-sm font-bold uppercase tracking-wider text-[#0a2f5c]">
              Top Activities
            </h2>
            <Link href="/activities" className="text-xs font-semibold text-[#144e9d] hover:underline">
              Manage tags
            </Link>
          </div>

          {insights.activities.length > 0 ? (
            <div className="mt-3.5 grid gap-2.5 sm:grid-cols-2">
              {insights.activities.map((activity) => (
                <Link
                  href={`/timeline?activity=${activity.activityId}`}
                  key={activity.activityId}
                  className="flex items-center gap-3 rounded-xl border border-white/70 bg-white/50 p-2.5 shadow-2xs transition hover:bg-white/75"
                  aria-label={`View timeline entries tagged ${activity.name}`}
                >
                  <span className="text-2xl drop-shadow-xs" aria-hidden="true">{activity.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-xs font-bold text-[#0a2f5c]">{activity.name}</h3>
                    <p className="text-[11px] font-medium text-[#2b4c73]">
                      {activity.count} {activity.count === 1 ? 'memory' : 'memories'}
                    </p>
                  </div>
                  <span className="text-xs font-bold text-[#146cc2]">›</span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="mt-3.5 space-y-2 text-center">
              <p className="text-xs font-medium text-[#2b4c73]">
                Activities will appear here as you tag your memories.
              </p>
              <Link href="/timeline/new" className="aero-btn text-xs">
                + Write an entry
              </Link>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

function InsightsLoading() {
  return (
    <main className="aero-page relative z-10 mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-4 sm:py-6 md:pt-8" aria-label="Loading insights">
      <p className="text-xs font-semibold text-[#2b4c73]">Loading insights…</p>
      <div className="aero-hero h-44 animate-pulse" />
      <div className="aero-card h-52 animate-pulse" />
    </main>
  );
}
