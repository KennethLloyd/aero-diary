import { Suspense } from 'react';
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
        <main className="aero-page relative z-10 mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-6 md:pt-10">
          <header className="px-2">
            <AeroTitle>Activities</AeroTitle>
            <p className="mt-1 text-sm font-semibold text-[#2b4c73] drop-shadow">
              Shape the tags that make your memories searchable.
            </p>
          </header>
          <Suspense fallback={<div className="aero-glass flex h-64 items-center justify-center p-5 text-sm font-semibold text-[#2b4c73]" aria-label="Loading activities">Loading activities…</div>}>
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
