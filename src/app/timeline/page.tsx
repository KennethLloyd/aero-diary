import { Suspense } from 'react';
import Link from 'next/link';
import { AeroBubbles } from '@/components/aero/AeroBubbles';
import { AeroScreen } from '@/components/aero/AeroScreen';
import { AeroTitle } from '@/components/aero/AeroTitle';
import { TimelineList } from '@/components/journal/TimelineList';
import { verifySession } from '@/lib/dal';
import { formatMonthLabel, getMonthFromParam } from '@/lib/journal/analytics';
import {
  getCachedTimelinePage,
  getTimelineClearSearchHref,
  parseTimelineFilter,
} from '@/lib/journal/timeline';
import { entryIdSchema } from '@/lib/journal/schemas';
import TimelineLoading from './loading';

type TimelinePageProps = {
  searchParams: Promise<{
    mood?: string | string[]
    activity?: string | string[]
    q?: string | string[]
    pendingInference?: string | string[]
  }>
}

export default function TimelinePage({ searchParams }: TimelinePageProps) {
  return (
    <>
      <AeroBubbles />
      <AeroScreen>
        <Suspense fallback={<TimelineLoading />}>
          <TimelineContent searchParams={searchParams} />
        </Suspense>
      </AeroScreen>
    </>
  );
}

async function TimelineContent({ searchParams }: TimelinePageProps) {
  const session = await verifySession();
  const params = await searchParams;
  const filter = parseTimelineFilter(params);
  const pendingInferenceValue = Array.isArray(params.pendingInference)
    ? params.pendingInference[0]
    : params.pendingInference;
  const pendingInferenceId = entryIdSchema.safeParse(pendingInferenceValue);
  const initialPage = await getCachedTimelinePage(session.userId, undefined, filter);
  const currentMonth = formatMonthLabel(getMonthFromParam(undefined));
  const hasFilter = Boolean(filter.mood || filter.activityId || filter.query);

  return (
    <main className="aero-page relative z-10 mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-4 sm:py-6 md:pt-8">
      <header className="flex items-center justify-between px-1">
        <div>
          <AeroTitle>Timeline</AeroTitle>
          <p className="mt-0.5 text-xs font-semibold text-[#2b4c73] drop-shadow-xs">
            {filter.query ? `Search results for “${filter.query}”` : hasFilter ? 'Filtered memories' : currentMonth}
          </p>
        </div>
        <Link
          href="/timeline/new"
          className="aero-btn inline-flex items-center gap-1.5 px-3.5 py-1.5 text-sm shadow-md"
          aria-label="New entry"
        >
          <span className="text-base font-bold leading-none">+</span>
          <span>New</span>
        </Link>
      </header>

      <form
        method="get"
        action="/timeline"
        className="aero-card flex flex-col gap-2.5 p-3 sm:p-4"
        aria-label="Search timeline"
      >
        <div className="min-w-0 flex-1">
          <label htmlFor="timeline-search" className="text-sm font-bold text-[#0a2f5c]">
            Search your notes
          </label>
          <div className="mt-1.5 flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 gap-2">
              <input
                id="timeline-search"
                name="q"
                type="search"
                defaultValue={filter.query ?? ''}
                maxLength={200}
                placeholder="Try a phrase from a memory"
                className="aero-input min-w-0 flex-1"
              />
              <button type="submit" className="aero-btn shrink-0 px-4 text-sm">
                Search
              </button>
            </div>
            {filter.query ? (
              <Link
                href={getTimelineClearSearchHref(filter)}
                className="aero-link-control self-end whitespace-nowrap text-sm font-bold text-[#144e9d] underline decoration-dotted underline-offset-4 sm:self-auto"
              >
                Clear search
              </Link>
            ) : null}
          </div>
        </div>
        {filter.mood ? <input type="hidden" name="mood" value={filter.mood} /> : null}
        {filter.activityId ? <input type="hidden" name="activity" value={filter.activityId} /> : null}
      </form>

      <TimelineList
        key={[
          filter.mood ?? '',
          filter.activityId ?? '',
          JSON.stringify(initialPage),
        ].join(':')}
        initialPage={initialPage}
        filter={filter}
        pendingInferenceId={pendingInferenceId.success ? pendingInferenceId.data : undefined}
      />
    </main>
  );
}
