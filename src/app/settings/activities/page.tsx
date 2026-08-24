import { Suspense } from 'react';
import { AeroBubbles } from '@/components/aero/AeroBubbles';
import { AeroPageHeader } from '@/components/aero/AeroPageHeader';
import { AeroScreen } from '@/components/aero/AeroScreen';
import { ActivityManager } from '@/components/journal/ActivityManager';
import { verifySession } from '@/lib/dal';
import { getActivitiesForUser, getArchivedActivitiesForUser } from '@/lib/journal/queries';
import Link from 'next/link';

export default function SettingsActivitiesPage() {
  return (
    <>
      <AeroBubbles />
      <AeroScreen>
        <main className="aero-page relative z-10 mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-6 md:pt-10">
          <AeroPageHeader
            title="Activities"
            subtitle="Shape the tags that make your memories searchable"
            trailing={
              <Link
                href="/settings"
                className="aero-link-control text-sm font-bold text-[#144e9d] hover:underline"
              >
                Settings
              </Link>
            }
            size="sm"
          />
          <Suspense fallback={<div className="aero-surface-card h-64 animate-pulse" aria-label="Loading activities">Loading…</div>}>
            <SettingsActivitiesContent />
          </Suspense>
        </main>
      </AeroScreen>
    </>
  );
}

async function SettingsActivitiesContent() {
  const session = await verifySession();
  const [activities, archivedActivities] = await Promise.all([
    getActivitiesForUser(session.userId),
    getArchivedActivitiesForUser(session.userId),
  ]);
  return (
    <ActivityManager activities={activities} archivedActivities={archivedActivities} />
  );
}
