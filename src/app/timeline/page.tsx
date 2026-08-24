import { Suspense } from 'react';
import { AeroBubbles } from '@/components/aero/AeroBubbles';
import { AeroIconButton } from '@/components/aero/AeroIconButton';
import { AeroPageHeader } from '@/components/aero/AeroPageHeader';
import { AeroScreen } from '@/components/aero/AeroScreen';
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
    <main className="aero-page relative z-10 mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-6 md:pt-10">
      <AeroPageHeader
        title="Today"
        subtitle={filter.mood || filter.activityId ? 'Filtered timeline' : currentMonth}
        size="md"
        trailing={
          <AeroIconButton href="/timeline/new" tone="primary" size="md" label="New entry">
            <span aria-hidden="true">+</span>
          </AeroIconButton>
        }
      />

      <TimelineList
        key={`${filter.mood ?? ''}:${filter.activityId ?? ''}`}
        initialPage={initialPage}
        filter={filter}
      />
    </main>
  );
}
