import { Suspense } from 'react';
import Link from 'next/link';
import { AeroBubbles } from '@/components/aero/AeroBubbles';
import { AeroScreen } from '@/components/aero/AeroScreen';
import { AeroTitle } from '@/components/aero/AeroTitle';
import { TimelineList } from '@/components/journal/TimelineList';
import { verifySession } from '@/lib/dal';
import { getCachedTimelinePage, parseTimelineFilter } from '@/lib/journal/timeline';
import TimelineLoading from './loading';

type TimelinePageProps = {
  searchParams: Promise<{ mood?: string | string[]; activity?: string | string[] }>
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
  const filter = parseTimelineFilter(await searchParams);
  const initialPage = await getCachedTimelinePage(session.userId, undefined, filter);
  const currentMonth = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
  }).format(new Date());

  return (
    <main className="aero-page relative z-10 mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-4 sm:py-6 md:pt-8">
      <header className="flex items-center justify-between px-1">
        <div>
          <AeroTitle>Timeline</AeroTitle>
          <p className="mt-0.5 text-xs font-semibold text-[#2b4c73] drop-shadow-xs">
            {filter.mood || filter.activityId ? 'Filtered memories' : currentMonth}
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

      <TimelineList
        key={[
          filter.mood ?? '',
          filter.activityId ?? '',
          JSON.stringify(initialPage),
        ].join(':')}
        initialPage={initialPage}
        filter={filter}
      />
    </main>
  );
}
