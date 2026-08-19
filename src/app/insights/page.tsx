import { AeroBubbles } from '@/components/aero/AeroBubbles';
import { AeroDock } from '@/components/aero/AeroDock';
import { AeroTitle } from '@/components/aero/AeroTitle';
import { MonthNavigator } from '@/components/journal/MonthNavigator';
import {
  getMonthFromParam,
  MOOD_EMOJI,
  MOOD_LABEL,
  MOOD_PROGRESS_CLASS,
  summarizeInsights,
} from '@/lib/journal/analytics';
import { listEntriesForMonth } from '@/lib/journal/queries';
import { verifySession } from '@/lib/dal';

export const dynamic = 'force-dynamic';

type InsightsPageProps = {
  searchParams: Promise<{ month?: string | string[] | undefined }>
}

export default async function InsightsPage({ searchParams }: InsightsPageProps) {
  await verifySession();
  const { month: monthParam } = await searchParams;
  const month = getMonthFromParam(monthParam);
  const entries = await listEntriesForMonth(month);
  const insights = summarizeInsights(entries);

  return (
    <>
      <AeroBubbles />
      <main className="aero-page relative z-10 mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-6 pb-32 md:pt-10 md:pb-32">
        <header className="px-2">
          <AeroTitle>Insights</AeroTitle>
          <p className="mt-1 text-sm font-semibold text-[#2b4c73] drop-shadow">
            Data &amp; Trends
          </p>
        </header>

        <section className="aero-glass p-2" aria-label="Insights month navigation">
          <MonthNavigator basePath="/insights" month={month} />
        </section>

        <section className="aero-glass space-y-4 p-5" aria-labelledby="mood-distribution-heading">
          <h2 id="mood-distribution-heading" className="border-b border-white/40 pb-2 text-lg font-bold text-[#0a2f5c] drop-shadow-sm">
            Mood Distribution
          </h2>
          <div className="space-y-3">
            {insights.moods.map(({ mood, count, percentage }) => (
              <div key={mood}>
                <div className="mb-1.5 flex justify-between text-sm font-bold text-[#2b4c73]">
                  <span className="drop-shadow-sm">
                    {MOOD_LABEL[mood]} ({MOOD_EMOJI[mood]})
                  </span>
                  <span aria-label={`${count} entries`}>{percentage}%</span>
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
            <p className="border-t border-white/40 pt-3 text-sm font-semibold text-[#2b4c73]">
              No entries logged for this month yet.
            </p>
          ) : null}
        </section>

        <section className="aero-glass p-5" aria-labelledby="top-activities-heading">
          <h2 id="top-activities-heading" className="mb-4 border-b border-white/40 pb-2 text-lg font-bold text-[#0a2f5c] drop-shadow-sm">
            Top Activities
          </h2>
          {insights.activities.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {insights.activities.map((activity) => (
                <article
                  key={activity.activityId}
                  className="flex min-w-[140px] flex-1 items-center gap-3 rounded-lg border border-white/60 bg-white/40 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.8),_0_2px_4px_rgba(0,0,0,0.05)]"
                >
                  <div className="text-3xl drop-shadow-md" aria-hidden="true">{activity.emoji}</div>
                  <div>
                    <h3 className="text-sm font-bold text-[#0a2f5c]">{activity.name}</h3>
                    <p className="text-xs font-medium text-[#2b4c73]">
                      {activity.count} {activity.count === 1 ? 'entry' : 'entries'}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="text-sm font-semibold text-[#2b4c73]">
              Activities will appear here as you tag your entries.
            </p>
          )}
        </section>
      </main>
      <AeroDock />
    </>
  );
}
