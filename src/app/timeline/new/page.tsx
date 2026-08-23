import { Suspense } from 'react';
import { AeroBubbles } from '@/components/aero/AeroBubbles';
import { AeroScreen } from '@/components/aero/AeroScreen';
import { AeroTitle } from '@/components/aero/AeroTitle';
import { NewEntryForm } from '@/components/journal/NewEntryForm';
import { verifySession } from '@/lib/dal';
import { getActivitiesForUser } from '@/lib/journal/queries';

export default function NewEntryPage() {
  return (
    <>
      <AeroBubbles />
      <AeroScreen>
        <main className="aero-page relative z-10 mx-auto flex w-full max-w-2xl flex-col px-4 py-6 md:pt-10">
          <AeroTitle className="mb-4 px-2">Aero Diary</AeroTitle>
          <Suspense fallback={<div className="aero-glass h-[32rem] animate-pulse" aria-label="Loading entry form" />}>
            <NewEntryContent />
          </Suspense>
        </main>
      </AeroScreen>
    </>
  );
}

async function NewEntryContent() {
  const session = await verifySession();
  const activities = await getActivitiesForUser(session.userId);

  return (
    <NewEntryForm activities={activities} />
  );
}
