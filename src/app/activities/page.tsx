import { Suspense } from 'react';
import { AeroBubbles } from '@/components/aero/AeroBubbles';
import { AeroDock } from '@/components/aero/AeroDock';
import { AeroTitle } from '@/components/aero/AeroTitle';
import { ActivityManager } from '@/components/journal/ActivityManager';
import { verifySession } from '@/lib/dal';
import { getActivitiesForUser } from '@/lib/journal/queries';

export default function ActivitiesPage() {
  return (
    <>
      <AeroBubbles />
      <main className="aero-page relative z-10 mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-6 pb-32 md:pt-10 md:pb-32">
        <header className="px-2">
          <AeroTitle>Activities</AeroTitle>
          <p className="mt-1 text-sm font-semibold text-[#2b4c73] drop-shadow">
            Shape the tags that make your memories searchable.
          </p>
        </header>
        <Suspense fallback={<div className="aero-glass h-64 animate-pulse" aria-label="Loading activities" />}>
          <ActivitiesContent />
        </Suspense>
      </main>
      <AeroDock />
    </>
  );
}

async function ActivitiesContent() {
  const session = await verifySession();
  const activities = await getActivitiesForUser(session.userId);

  return (
    <ActivityManager activities={activities} />
  );
}
