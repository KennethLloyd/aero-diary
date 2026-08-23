import { AeroBubbles } from '@/components/aero/AeroBubbles';
import { AeroDock } from '@/components/aero/AeroDock';
import { AeroTitle } from '@/components/aero/AeroTitle';
import { AeroButton } from '@/components/aero/AeroButton';
import { TimelineList } from '@/components/journal/TimelineList';
import { db } from '@/lib/db';
import { verifySession } from '@/lib/dal';
import { listTimelinePage } from '@/lib/journal/timeline';

// The timeline is inherently per-user and request-time rendered.
export const dynamic = 'force-dynamic';

export default async function TimelinePage() {
  // Auth gate (ADR-0002): every protected page/action starts with verifySession.
  const session = await verifySession();

  const initialPage = await listTimelinePage(db, session.userId);
  const currentMonth = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
  }).format(new Date());

  return (
    <>
      <AeroBubbles />
      <div className="aero-page relative z-10 mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-6 pb-32 md:pt-10 md:pb-32">
        <header className="mb-2 flex items-end justify-between px-2">
          <div>
            <AeroTitle>Aero Diary</AeroTitle>
            <p className="mt-1 text-sm font-semibold text-[#2b4c73] drop-shadow">
              {currentMonth}
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

        <TimelineList initialPage={initialPage} />
      </div>
      <AeroDock />
    </>
  );
}
