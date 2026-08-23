import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { AeroBubbles } from '@/components/aero/AeroBubbles';
import { AeroDock } from '@/components/aero/AeroDock';
import { AeroOrb } from '@/components/aero/AeroOrb';
import { EntryBackButton } from '@/components/journal/EntryBackButton';
import { DeleteEntryDialog } from '@/components/journal/DeleteEntryDialog';
import { PhotoGallery } from '@/components/journal/PhotoGallery';
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
      <Suspense fallback={<EntryDetailLoading />}>
        <EntryDetailContent params={params} />
      </Suspense>
      <AeroDock />
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
    <main className="aero-page relative z-10 mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6 md:pt-10">
        <header className="mb-2 flex items-center justify-between px-2">
          <EntryBackButton />
          <div className="flex items-center gap-3">
            <Link
              href={`/timeline/${entry.id}/edit`}
              className="aero-link-control font-bold text-[#144e9d] drop-shadow-md hover:text-[#0a2f5c]"
            >
              Edit
            </Link>
            <DeleteEntryDialog entryId={entry.id} />
          </div>
        </header>

        <article className="aero-glass space-y-6 p-5">
          <div className="relative z-10">
            <section className="space-y-4 border-b border-white/50 pb-4" aria-labelledby="entry-mood-heading">
              <time
                dateTime={entry.date}
                className="text-xs font-bold uppercase tracking-wide text-[#2b4c73]"
              >
                {formatEntryTimestamp(new Date(entry.date), entry.localOffset)}
              </time>

              <div className="flex items-center gap-4 pt-1">
                <AeroOrb
                  mood={entry.mood}
                  className="h-16 w-16 border-4 border-white/80 text-4xl shadow-lg"
                />
                <div className="min-w-0">
                  <h1 id="entry-mood-heading" className="text-3xl font-bold tracking-tight text-[#0a2f5c] drop-shadow-md">
                    {MOOD_LABEL[entry.mood]}
                  </h1>
                </div>
              </div>
            </section>

            {entry.activities.length > 0 ? (
              <section className="flex flex-wrap gap-2 pt-2" aria-label="Activities">
                {entry.activities.map(({ activityId, activity }) => (
                  <span
                    key={activityId}
                    className="rounded-full border border-gray-300 bg-gradient-to-b from-white to-gray-200 px-3 py-1 text-xs font-bold text-[#0a2f5c] shadow-sm"
                  >
                    {activity.emoji} {activity.name}
                  </span>
                ))}
              </section>
            ) : null}

            <section className="pt-6" aria-labelledby="entry-article-heading">
              <h2 id="entry-article-heading" className="sr-only">Journal entry</h2>
              <div className="space-y-4 text-[15px] font-medium leading-relaxed text-[#111]">
                {paragraphs.map((paragraph, index) => (
                  <p className="whitespace-pre-wrap" key={`${entry.id}-paragraph-${index}`}>
                    {paragraph}
                  </p>
                ))}
              </div>
            </section>

            {entry.photos.length > 0 ? (
              <section className="pt-6" aria-labelledby="entry-photos-heading">
                <h2 id="entry-photos-heading" className="mb-2 text-xs font-bold uppercase tracking-wide text-[#2b4c73]">
                  Photos
                </h2>
                <PhotoGallery photos={entry.photos.map(({ id }) => ({ id }))} />
              </section>
            ) : null}
          </div>
        </article>
    </main>
  );
}
