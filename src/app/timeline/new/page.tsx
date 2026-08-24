import { Suspense } from 'react';
import { AeroBubbles } from '@/components/aero/AeroBubbles';
import { AeroScreen } from '@/components/aero/AeroScreen';
import { NewEntryForm } from '@/components/journal/NewEntryForm';
import { verifySession } from '@/lib/dal';
import { getActivitiesForUser } from '@/lib/journal/queries';

export default function NewEntryPage() {
  return (
    <>
      <AeroBubbles />
      <AeroScreen>
        <main className="aero-page aero-entry-page relative z-10 mx-auto flex h-full w-full max-w-2xl flex-col md:pt-6">
          <Suspense fallback={<div className="aero-surface-card h-96 animate-pulse m-4" aria-label="Loading entry form" />}>
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
