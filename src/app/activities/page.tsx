import { Suspense } from 'react';
import Link from 'next/link';
import { AeroBubbles } from '@/components/aero/AeroBubbles';
import { AeroScreen } from '@/components/aero/AeroScreen';
import { AeroTitle } from '@/components/aero/AeroTitle';
import { ActivityManager } from '@/components/journal/ActivityManager';
import { verifySession } from '@/lib/dal';
import { getActivitiesForUser, getArchivedActivitiesForUser } from '@/lib/journal/queries';

export default function ActivitiesPage() {
  return (
    <>
      <AeroBubbles />
      <AeroScreen>
        <main className="aero-page relative z-10 mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-4 sm:py-6 md:pt-8">
          <header className="flex items-center gap-2 px-1">
            <Link
              href="/settings"
              className="aero-icon-btn"
              aria-label="Back to settings"
            >
              <span aria-hidden="true">‹</span>
            </Link>
            <div>
              <AeroTitle>Activities</AeroTitle>
              <p className="mt-0.5 text-xs font-semibold text-[#2b4c73] drop-shadow-2xs">
                The tags that make your memories searchable.
              </p>
            </div>
          </header>
          <Suspense fallback={<div className="aero-card flex h-64 items-center justify-center p-5 text-xs font-semibold text-[#2b4c73]" aria-label="Loading activities">Loading activities…</div>}>
            <ActivitiesContent />
          </Suspense>
        </main>
      </AeroScreen>
    </>
  );
}

async function ActivitiesContent() {
  const session = await verifySession();
  const [activities, archivedActivities] = await Promise.all([
    getActivitiesForUser(session.userId),
    getArchivedActivitiesForUser(session.userId),
  ]);

  return (
    <ActivityManager activities={activities} archivedActivities={archivedActivities} />
  );
}
