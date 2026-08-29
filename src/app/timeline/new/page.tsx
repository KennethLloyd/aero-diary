import { Suspense } from 'react';
import { AeroBubbles } from '@/components/aero/AeroBubbles';
import { AeroScreen } from '@/components/aero/AeroScreen';
import { NewEntryForm } from '@/components/journal/NewEntryForm';
import { verifySession } from '@/lib/dal';
import { getTodayDateKey } from '@/lib/journal/dates';

export default function NewEntryPage() {
  return (
    <>
      <AeroBubbles />
      <AeroScreen hideDockNearSave>
        <main className="aero-page aero-entry-page relative z-10 mx-auto flex max-sm:h-full w-full max-w-2xl flex-col px-4 py-4 sm:py-6 md:pt-8">
          <Suspense fallback={<div className="aero-card h-[32rem] animate-pulse" aria-label="Loading entry form" />}>
            <NewEntryContent />
          </Suspense>
        </main>
      </AeroScreen>
    </>
  );
}

async function NewEntryContent() {
  await verifySession();
  const todayDateKey = getTodayDateKey();

  return (
    <NewEntryForm todayDateKey={todayDateKey} />
  );
}

