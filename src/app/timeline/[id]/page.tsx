import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { AeroBubbles } from '@/components/aero/AeroBubbles';
import { AeroChip } from '@/components/aero/AeroChip';
import { AeroOrb } from '@/components/aero/AeroOrb';
import { AeroScreen } from '@/components/aero/AeroScreen';
import { DeleteEntryDialog } from '@/components/journal/DeleteEntryDialog';
import { EntryBackButton } from '@/components/journal/EntryBackButton';
import { ManageablePhotoGallery } from '@/components/journal/ManageablePhotoGallery';
import { verifySession } from '@/lib/dal';
import { splitJournalNoteParagraphs } from '@/lib/journal/notes';
import { getEntryDetailForUser } from '@/lib/journal/queries';
import { entryIdSchema } from '@/lib/journal/schemas';
import type { Mood } from '@/generated/prisma/enums';
import EntryDetailLoading from './loading';

const MOOD_LABEL: Record<Mood, string> = {
  AWFUL: 'Awful',
  BAD: 'Bad',
  MEH: 'Meh',
  GOOD: 'Good',
  RAD: 'Rad',
};

function formatEntryTimestamp(date: Date, localOffset: number) {
  const local = new Date(date.getTime() + localOffset * 60_000);
  const dateFormatter = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const timeFormatter = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
  });
  return `${dateFormatter.format(local)} · ${timeFormatter.format(local)}`;
}

type EntryDetailPageProps = {
  params: Promise<{ id: string }>
}

export default function EntryDetailPage({ params }: EntryDetailPageProps) {
  return (
    <>
      <AeroBubbles />
      <AeroScreen>
        <Suspense fallback={<EntryDetailLoading />}>
          <EntryDetailContent params={params} />
        </Suspense>
      </AeroScreen>
    </>
  );
}

async function EntryDetailContent({ params }: EntryDetailPageProps) {
  const session = await verifySession();
  const { id } = await params;
  const parsedId = entryIdSchema.safeParse(id);
  if (!parsedId.success) notFound();

  const entry = await getEntryDetailForUser(session.userId, parsedId.data);
  if (!entry) notFound();

  const paragraphs = splitJournalNoteParagraphs(entry.note);

  return (
    <main className="aero-page relative z-10 mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-6 md:pt-10">
      <header className="flex items-center justify-between gap-3 px-2">
        <EntryBackButton />
        <div className="flex items-center gap-1.5">
          <a
            href={`/timeline/${entry.id}/edit`}
            className="aero-link-control text-sm font-bold text-[#144e9d] drop-shadow-md hover:underline"
          >
            Edit
          </a>
          <DeleteEntryDialog entryId={entry.id} />
        </div>
      </header>

      <article className="aero-surface-card p-5 sm:p-6">
        <div className="space-y-6">
          <header className="space-y-3 border-b border-white/50 pb-5">
            <time
              dateTime={entry.date}
              className="block text-xs font-bold uppercase tracking-wide text-[#5a7194]"
            >
              {formatEntryTimestamp(new Date(entry.date), entry.localOffset)}
            </time>
            <div className="flex items-center gap-3">
              <AeroOrb
                mood={entry.mood}
                className="h-14 w-14 border-4 border-white/80 text-3xl shadow-lg"
              />
              <div className="min-w-0">
                <h1 className="text-2xl font-bold tracking-tight text-[#0a2f5c] drop-shadow-md">
                  {MOOD_LABEL[entry.mood]}
                </h1>
              </div>
            </div>
          </header>

          {entry.activities.length > 0 ? (
            <section aria-label="Activities">
              <h2 className="sr-only">Activities</h2>
              <div className="flex flex-wrap gap-1.5">
                {entry.activities.map(({ activityId, activity }) => (
                  <AeroChip key={activityId} size="sm" tone="subtle">
                    <span aria-hidden="true">{activity.emoji}</span>
                    <span>{activity.name}</span>
                  </AeroChip>
                ))}
              </div>
            </section>
          ) : null}

          <section aria-labelledby="entry-article-heading">
            <h2 id="entry-article-heading" className="sr-only">Journal entry</h2>
            <div className="space-y-4 text-[17px] font-normal leading-[1.75rem] text-[#0a2f5c]">
              {paragraphs.map((paragraph, index) => (
                <p className="whitespace-pre-wrap" key={`${entry.id}-paragraph-${index}`}>
                  {paragraph}
                </p>
              ))}
            </div>
          </section>

          {entry.photos.length > 0 ? (
            <ManageablePhotoGallery photos={entry.photos.map(({ id }) => ({ id }))} />
          ) : null}
        </div>
      </article>
    </main>
  );
}
