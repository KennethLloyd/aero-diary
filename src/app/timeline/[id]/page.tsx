import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { AeroBubbles } from '@/components/aero/AeroBubbles';
import { AeroScreen } from '@/components/aero/AeroScreen';
import { AeroOrb } from '@/components/aero/AeroOrb';
import { EntryBackButton } from '@/components/journal/EntryBackButton';
import { DeleteEntryDialog } from '@/components/journal/DeleteEntryDialog';
import { PhotoGallery } from '@/components/journal/PhotoGallery';
import { verifySession } from '@/lib/dal';
import { splitJournalNoteParagraphs } from '@/lib/journal/notes';
import { formatDateKey } from '@/lib/journal/dates';
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
    <main className="aero-page relative z-10 mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-4 sm:py-6 md:pt-8">
      {/* Secondary Action Header */}
      <header className="flex items-center justify-between px-1">
        <EntryBackButton />
        <div className="flex items-center gap-2">
          <Link
            href={`/timeline/${entry.id}/edit`}
            className="aero-btn aero-btn-white px-3.5 py-1 text-xs font-bold"
          >
            Edit
          </Link>
          <DeleteEntryDialog entryId={entry.id} />
        </div>
      </header>

      {/* Memory Postcard Card */}
      <article className="aero-card space-y-5 p-5 sm:p-6">
        <div className="relative z-10">
          {/* Metadata & Mood Header */}
          <section className="space-y-3 border-b border-white/60 pb-4" aria-labelledby="entry-mood-heading">
            <time
              dateTime={entry.journalDate}
              className="block text-xs font-bold uppercase tracking-wider text-[#2b4c73]"
            >
              {formatDateKey(entry.journalDate)}
            </time>

            <div className="flex items-center gap-3.5 pt-0.5">
              <AeroOrb
                mood={entry.mood}
                className="h-14 w-14 border-3 border-white/90 text-3xl shadow-md"
              />
              <div>
                <h1 id="entry-mood-heading" className="text-2xl font-bold tracking-tight text-[#0a2f5c] drop-shadow-xs">
                  {MOOD_LABEL[entry.mood]}
                </h1>
              </div>
            </div>
          </section>

          {/* Activity Tags */}
          {entry.activities.length > 0 ? (
            <section className="flex flex-wrap gap-1.5 pt-3" aria-label="Activities">
              {entry.activities.map(({ activityId, activity }) => (
                <span
                  key={activityId}
                  className="inline-flex items-center gap-1 rounded-full border border-white/80 bg-white/70 px-2.5 py-1 text-xs font-semibold text-[#0a2f5c] shadow-2xs"
                >
                  <span>{activity.emoji}</span>
                  <span>{activity.name}</span>
                </span>
              ))}
            </section>
          ) : null}

          {/* Journal Note Content */}
          <section className="pt-5" aria-labelledby="entry-article-heading">
            <h2 id="entry-article-heading" className="sr-only">Journal note</h2>
            <div className="max-w-[68ch] space-y-4 text-[15px] font-normal leading-relaxed text-[#1a2c42] sm:text-base sm:leading-7">
              {paragraphs.map((paragraph, index) => (
                <p className="whitespace-pre-wrap" key={`${entry.id}-paragraph-${index}`}>
                  {paragraph}
                </p>
              ))}
            </div>
          </section>

          {/* Photos */}
          {entry.photos.length > 0 ? (
            <section className="pt-6" aria-labelledby="entry-photos-heading">
              <h2 id="entry-photos-heading" className="mb-2 text-xs font-bold uppercase tracking-wider text-[#2b4c73]">
                Memories &amp; Photos
              </h2>
              <PhotoGallery photos={entry.photos.map(({ id }) => ({ id }))} />
            </section>
          ) : null}
        </div>
      </article>
    </main>
  );
}
