import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { AeroBubbles } from '@/components/aero/AeroBubbles';
import { AeroScreen } from '@/components/aero/AeroScreen';
import { AeroTitle } from '@/components/aero/AeroTitle';
import { NewEntryForm } from '@/components/journal/NewEntryForm';
import { verifySession } from '@/lib/dal';
import { getActivitiesForUser, getEntryDetailForUser } from '@/lib/journal/queries';
import { entryIdSchema } from '@/lib/journal/schemas';

type EditEntryPageProps = {
  params: Promise<{ id: string }>
}

export default function EditEntryPage({ params }: EditEntryPageProps) {
  return (
    <>
      <AeroBubbles />
      <AeroScreen>
        <main className="aero-page aero-entry-page relative z-10 mx-auto flex h-full w-full max-w-2xl flex-col px-4 py-6 md:pt-10">
          <AeroTitle className="mb-4 px-2">Aero Diary</AeroTitle>
          <Suspense fallback={<div className="aero-glass h-[32rem] animate-pulse" aria-label="Loading entry form" />}>
            <EditEntryContent params={params} />
          </Suspense>
        </main>
      </AeroScreen>
    </>
  );
}

async function EditEntryContent({ params }: EditEntryPageProps) {
  const session = await verifySession();
  const { id } = await params;
  const parsedId = entryIdSchema.safeParse(id);
  if (!parsedId.success) notFound();

  const [entry, activities] = await Promise.all([
    getEntryDetailForUser(session.userId, parsedId.data),
    getActivitiesForUser(session.userId),
  ]);
  if (!entry) notFound();

  return (
    <NewEntryForm
      activities={activities}
      entry={{
        id: entry.id,
        mood: entry.mood,
        note: entry.note,
        localOffset: entry.localOffset,
        activityIds: entry.activities.map(({ activityId }) => activityId),
      }}
    />
  );
}
