import { AeroBubbles } from '@/components/aero/AeroBubbles'
import { AeroDock } from '@/components/aero/AeroDock'
import { AeroOrb } from '@/components/aero/AeroOrb'
import { AeroTitle } from '@/components/aero/AeroTitle'
import { AeroButton } from '@/components/aero/AeroButton'
import Link from 'next/link'
import { db } from '@/lib/db'
import { verifySession } from '@/lib/dal'
import type { Mood } from '@/generated/prisma/enums'

// The timeline is inherently per-user and request-time rendered.
export const dynamic = 'force-dynamic'

type TimelineEntry = {
  id: string
  date: string
  time: string
  mood: Mood
  note: string
  tags: { id: string; label: string }[]
}

type DbEntry = {
  id: string
  date: Date
  localOffset: number
  mood: Mood
  note: string
  activities: { activityId: string; activity: { emoji: string; name: string } }[]
}

function formatEntry(entry: DbEntry): TimelineEntry {
  const local = new Date(entry.date.getTime() + entry.localOffset * 60_000)
  const dateFormatter = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  })
  const timeFormatter = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
  })
  return {
    id: entry.id,
    date: dateFormatter.format(local),
    time: timeFormatter.format(local),
    mood: entry.mood,
    note: entry.note,
    tags: entry.activities.map((a) => ({
      id: a.activityId,
      label: `${a.activity.emoji} ${a.activity.name}`,
    })),
  }
}

export default async function TimelinePage() {
  // Auth gate (ADR-0002): every protected page/action starts with verifySession.
  const session = await verifySession()

  const dbEntries = await db.entry.findMany({
    where: { userId: session.userId },
    orderBy: { date: 'desc' },
    include: { activities: { include: { activity: true } } },
  })
  const entries = dbEntries.map(formatEntry)
  const currentMonth = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
  }).format(new Date())

  return (
    <>
      <AeroBubbles />
      <div className="relative z-10 mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 px-4 py-6 pb-32 md:py-10">
        <header className="mb-2 flex items-end justify-between px-2">
          <div>
            <AeroTitle>Aero Diary</AeroTitle>
            <p className="mt-1 text-sm font-semibold text-[#2b4c73] drop-shadow">
              {currentMonth}
            </p>
          </div>
          <AeroButton
            href="/timeline/new"
            className="flex h-10 w-10 items-center justify-center rounded-full pb-2 text-lg shadow-lg"
            aria-label="New entry"
          >
            +
          </AeroButton>
        </header>

        {entries.length > 0 ? (
          <div className="space-y-4">
            {entries.map((entry) => (
              <Link
                key={entry.id}
                href={`/timeline/${entry.id}`}
                className="aero-glass block p-4 transition-transform duration-200 hover:scale-[1.02]"
              >
                <div className="relative z-10 flex flex-row items-start gap-4">
                  <div className="flex flex-col items-center pt-1">
                    <AeroOrb mood={entry.mood} className="text-white drop-shadow-md" />
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 border-b border-white/40 pb-1">
                      <h3 className="text-lg font-bold text-[#0a2f5c]">{entry.date}</h3>
                      <span className="text-xs font-bold text-[#2b4c73]">{entry.time}</span>
                    </div>
                    <p className="line-clamp-2 text-sm font-medium leading-relaxed text-[#1a2c42]">
                      {entry.note}
                    </p>
                    {entry.tags.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {entry.tags.map((tag) => (
                          <span
                            key={tag.id}
                            className="rounded-full border border-white bg-white/60 px-2 py-0.5 text-xs font-bold text-[#0a2f5c] shadow-sm"
                          >
                            {tag.label}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <section className="aero-glass p-8 text-center">
            <h2 className="text-xl font-bold text-[#0a2f5c]">Your timeline is waiting.</h2>
            <p className="mt-2 text-sm font-semibold text-[#2b4c73]">
              Capture how today feels and your first memory will appear here.
            </p>
          </section>
        )}
      </div>
      <AeroDock />
    </>
  )
}
