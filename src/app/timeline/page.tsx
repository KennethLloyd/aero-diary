import { Suspense } from 'react';
import { AeroBubbles } from '@/components/aero/AeroBubbles';
import { AeroDock } from '@/components/aero/AeroDock';
import { AeroTitle } from '@/components/aero/AeroTitle';
import { AeroButton } from '@/components/aero/AeroButton';
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
      <Suspense fallback={<TimelineLoading />}>
        <TimelineContent searchParams={searchParams} />
      </Suspense>
      <AeroDock />
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
    <main className="aero-page relative z-10 mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-6 md:pt-10">
      <header className="mb-2 flex items-end justify-between px-2">
        <div>
          <AeroTitle>Aero Diary</AeroTitle>
          <p className="mt-1 text-sm font-semibold text-[#2b4c73] drop-shadow">
            {filter.mood || filter.activityId ? 'Filtered timeline' : currentMonth}
          </p>
        </div>
        <AeroButton
          href="/timeline/new"
          className="flex h-10 w-10 items-center justify-center rounded-full pb-2 text-lg shadow-lg"
          aria-label="New entry"
        >
          +
        </AeroButton>
      </header>

      <TimelineList initialPage={initialPage} filter={filter} />
    </main>
  );
}
