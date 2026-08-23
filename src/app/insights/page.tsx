import Link from 'next/link';
import { Suspense } from 'react';
import { AeroBubbles } from '@/components/aero/AeroBubbles';
import { AeroScreen } from '@/components/aero/AeroScreen';
import { AeroTitle } from '@/components/aero/AeroTitle';
import { MonthNavigator } from '@/components/journal/MonthNavigator';
import {
  getMonthFromParam,
  getPreviousMonth,
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
  const [entries, previousEntries] = await Promise.all([
    getEntriesForMonthForUser(session.userId, month),
    getEntriesForMonthForUser(session.userId, getPreviousMonth(month)),
  ]);
  const insights = summarizeInsights(entries);
  const mostCommonMood = insights.moods.reduce((best, mood) => mood.count > best.count ? mood : best, insights.moods[0]);
  const entryDelta = entries.length - previousEntries.length;

  return (
    <main className="aero-page relative z-10 mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-6 md:pt-10">
        <header className="px-2">
          <AeroTitle>Insights</AeroTitle>
          <p className="mt-1 text-sm font-semibold text-[#2b4c73] drop-shadow">
            Data &amp; Trends
          </p>
        </header>

        <section className="aero-glass p-2" aria-label="Insights month navigation">
          <MonthNavigator basePath="/insights" month={month} />
        </section>

        <section className="aero-glass grid gap-3 p-4 sm:grid-cols-2" aria-label="Monthly insight summary">
          <div>
            <p className="text-3xl font-bold text-[#0a2f5c]">{entries.length}</p>
            <p className="text-sm font-semibold text-[#2b4c73]">entries this month</p>
          </div>
          <div className="rounded-lg border border-white/60 bg-white/35 p-3">
            <p className="text-sm font-bold text-[#0a2f5c]">
              {entryDelta === 0 ? 'No change' : `${entryDelta > 0 ? '+' : ''}${entryDelta} entries`}
            </p>
            <p className="text-xs font-semibold text-[#2b4c73]">compared with last month</p>
          </div>
          {entries.length > 0 && mostCommonMood ? (
            <p className="sm:col-span-2 text-sm font-semibold text-[#2b4c73]">
              Your most common mood was <strong className="text-[#0a2f5c]">{MOOD_LABEL[mostCommonMood.mood]}</strong> ({mostCommonMood.count} {mostCommonMood.count === 1 ? 'entry' : 'entries'}).
            </p>
          ) : null}
        </section>

        <section className="aero-glass space-y-4 p-5" aria-labelledby="mood-distribution-heading">
          <h2 id="mood-distribution-heading" className="border-b border-white/40 pb-2 text-lg font-bold text-[#0a2f5c] drop-shadow-sm">
            Mood Distribution
          </h2>
          <div className="space-y-3">
            {insights.moods.map(({ mood, count, percentage }) => (
              <div key={mood}>
                <div className="mb-1.5 flex items-center justify-between gap-3 text-sm font-bold text-[#2b4c73]">
                  <Link
                    href={`/timeline?mood=${mood}`}
                    className="aero-link-control -ml-3 min-w-0 justify-start px-3 py-1 drop-shadow-sm hover:underline"
                  >
                    {MOOD_LABEL[mood]} ({MOOD_EMOJI[mood]})
                  </Link>
                  <span className="shrink-0" aria-label={`${count} entries`}>{count} · {percentage}%</span>
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
            <div className="border-t border-white/40 pt-3">
              <p className="text-sm font-semibold text-[#2b4c73]">No entries logged for this month yet.</p>
              <Link href="/timeline/new" className="aero-btn mt-3">Write an entry</Link>
            </div>
          ) : null}
        </section>

        <section className="aero-glass p-5" aria-labelledby="top-activities-heading">
          <h2 id="top-activities-heading" className="mb-4 border-b border-white/40 pb-2 text-lg font-bold text-[#0a2f5c] drop-shadow-sm">
            Top Activities
          </h2>
          {insights.activities.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {insights.activities.map((activity) => (
                <Link
                  href={`/timeline?activity=${activity.activityId}`}
                  key={activity.activityId}
                  className="flex min-w-[140px] flex-1 items-center gap-3 rounded-lg border border-white/60 bg-white/40 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.8),_0_2px_4px_rgba(0,0,0,0.05)] hover:bg-white/65"
                  aria-label={`View timeline entries tagged ${activity.name}`}
                >
                  <div className="text-3xl drop-shadow-md" aria-hidden="true">{activity.emoji}</div>
                  <div>
                    <h3 className="text-sm font-bold text-[#0a2f5c]">{activity.name}</h3>
                    <p className="text-xs font-medium text-[#2b4c73]">
                      {activity.count} {activity.count === 1 ? 'entry' : 'entries'}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-[#2b4c73]">Activities will appear here as you tag your entries.</p>
              <Link href="/timeline/new" className="aero-btn">Write an entry</Link>
            </div>
          )}
        </section>
    </main>
  );
}

function InsightsLoading() {
  return (
    <main className="aero-page relative z-10 mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-6 md:pt-10" aria-label="Loading insights">
      <p className="text-sm font-semibold text-[#2b4c73]">Loading insights…</p>
      <div className="aero-glass h-64 animate-pulse p-5" />
      <div className="aero-glass h-48 animate-pulse p-5" />
    </main>
  );
}
