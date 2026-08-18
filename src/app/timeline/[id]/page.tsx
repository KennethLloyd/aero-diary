import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AeroBubbles } from '@/components/aero/AeroBubbles'
import { AeroDock } from '@/components/aero/AeroDock'
import { AeroOrb } from '@/components/aero/AeroOrb'
import { DeleteEntryDialog } from '@/components/journal/DeleteEntryDialog'
import { db } from '@/lib/db'
import { verifySession } from '@/lib/dal'
import { entryIdSchema } from '@/lib/journal/schemas'
import type { Mood } from '@/generated/prisma/enums'

export const dynamic = 'force-dynamic'

const MOOD_LABEL: Record<Mood, string> = {
  AWFUL: 'Awful',
  BAD: 'Bad',
  MEH: 'Meh',
  GOOD: 'Good',
  RAD: 'Rad',
}

function formatEntryTimestamp(date: Date, localOffset: number) {
  const local = new Date(date.getTime() + localOffset * 60_000)
  const dateFormatter = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
  const timeFormatter = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
  })
  return `${dateFormatter.format(local)} · ${timeFormatter.format(local)}`
}

function entryTitle(note: string) {
  const firstLine = note.split(/\r?\n/).map((line) => line.trim()).find(Boolean)
  if (!firstLine) return 'Untitled memory'
  return firstLine.length > 72 ? `${firstLine.slice(0, 69)}…` : firstLine
}

function entryParagraphs(note: string) {
  return note
    .split(/\r?\n\s*\r?\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
}

type EntryDetailPageProps = {
  params: Promise<{ id: string }>
}

export default async function EntryDetailPage({ params }: EntryDetailPageProps) {
  const session = await verifySession()
  const { id } = await params
  const parsedId = entryIdSchema.safeParse(id)
  if (!parsedId.success) notFound()

  const entry = await db.entry.findFirst({
    where: { id: parsedId.data, userId: session.userId },
    include: {
      activities: { include: { activity: true } },
      photos: { orderBy: { createdAt: 'asc' } },
    },
  })
  if (!entry) notFound()

  const paragraphs = entryParagraphs(entry.note)

  return (
    <>
      <AeroBubbles />
      <main className="aero-page relative z-10 mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6 pb-32 md:pt-10 md:pb-32">
        <header className="mb-2 flex items-center justify-between px-2">
          <Link
            href="/timeline"
            className="flex items-center gap-1 text-sm font-bold text-[#144e9d] drop-shadow-md hover:underline"
          >
            <span className="text-lg" aria-hidden="true">&lsaquo;</span>
            <span>Back</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href={`/timeline/${entry.id}/edit`}
              className="text-sm font-bold text-[#144e9d] drop-shadow-md hover:text-[#0a2f5c]"
            >
              Edit
            </Link>
            <DeleteEntryDialog entryId={entry.id} />
          </div>
        </header>

        <article className="aero-glass aero-detail-card space-y-6 p-5">
          <div className="relative z-10">
            <section className="space-y-4 border-b border-white/50 pb-4" aria-labelledby="entry-mood-heading">
              <time
                dateTime={entry.date.toISOString()}
                className="text-xs font-bold uppercase tracking-wide text-[#2b4c73]"
              >
                {formatEntryTimestamp(entry.date, entry.localOffset)}
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
                  <p className="mt-0.5 text-sm font-semibold text-[#1a2c42]">{entryTitle(entry.note)}</p>
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
                {paragraphs.map((paragraph, index) => <p key={`${entry.id}-paragraph-${index}`}>{paragraph}</p>)}
              </div>
            </section>

            <section className="pt-6" aria-labelledby="entry-photos-heading">
              <h2 id="entry-photos-heading" className="mb-2 text-xs font-bold uppercase tracking-wide text-[#2b4c73]">
                Photos
              </h2>
              <div className="aero-photo-strip no-scrollbar" aria-label="Polaroid photo strip">
                {entry.photos.length > 0 ? entry.photos.map((photo, index) => (
                  <figure key={photo.id} className={`aero-polaroid ${index % 2 === 0 ? 'rotate-[-2deg]' : 'mt-2 rotate-[3deg]'}`}>
                    <div className="aero-photo-placeholder" aria-label={`Photo ${index + 1} attached`}>
                      <span aria-hidden="true">📷</span>
                    </div>
                    <figcaption>Photo {index + 1}</figcaption>
                  </figure>
                )) : (
                  <figure className="aero-polaroid aero-polaroid-empty">
                    <div className="aero-photo-placeholder" aria-hidden="true">📷</div>
                    <figcaption>No photos attached yet.</figcaption>
                  </figure>
                )}
              </div>
            </section>
          </div>
        </article>
      </main>
      <AeroDock />
    </>
  )
}
