import { AeroBubbles } from '@/components/aero/AeroBubbles'
import { AeroDock } from '@/components/aero/AeroDock'
import { AeroOrb } from '@/components/aero/AeroOrb'
import { AeroTitle } from '@/components/aero/AeroTitle'
import { db } from '@/lib/db'
import type { Mood } from '@/generated/prisma/enums'

// The timeline is inherently per-user/dynamic (auth lands in ticket #2).
export const dynamic = 'force-dynamic'

type TimelineEntry = {
  id: string
  day: string
  time: string
  mood: Mood
  note: string
  tags: string[]
}

// Placeholder shell data — shown only while the DB is empty (no seed yet).
// Content is fictional, matching the prototype's vibe.
const SAMPLE_ENTRIES: TimelineEntry[] = [
  {
    id: 'sample-1',
    day: 'Thursday, 30th',
    time: '9:42 PM',
    mood: 'RAD',
    note: 'Took an early leave from the desk and headed straight for the ridge line. The air was surprisingly crisp after last night’s rain...',
    tags: ['🌲 Trail', '☕ Coffee'],
  },
  {
    id: 'sample-2',
    day: 'Wednesday, 29th',
    time: '1:15 PM',
    mood: 'BAD',
    note: 'Servers went down right during the client demo. Just feeling completely drained and anxious about the follow-up meeting tomorrow.',
    tags: ['💻 Work'],
  },
]

type DbEntry = {
  id: string
  date: Date
  localOffset: number
  mood: Mood
  note: string
  activities: { activity: { emoji: string; name: string } }[]
}

function formatEntry(entry: DbEntry): TimelineEntry {
  const local = new Date(entry.date.getTime() + entry.localOffset * 60_000)
  return {
    id: entry.id,
    day: local.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric' }),
    time: local.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
    mood: entry.mood,
    note: entry.note,
    tags: entry.activities.map((a) => `${a.activity.emoji} ${a.activity.name}`),
  }
}

export default async function TimelinePage() {
  // Scaffold spike (ADR-0001): exercise the better-sqlite3 adapter through
  // Turbopack at runtime. Real entry rendering lands with the timeline ticket.
  const dbEntries = await db.entry.findMany({
    orderBy: { date: 'desc' },
    take: 20,
    include: { activities: { include: { activity: true } } },
  })
  const entries = dbEntries.length > 0 ? dbEntries.map(formatEntry) : SAMPLE_ENTRIES

  return (
    <>
      <AeroBubbles />
      <div className="relative z-10 mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 py-6 pb-32 md:py-10">
        <header className="mb-2 flex items-end justify-between px-2">
          <div>
            <AeroTitle>Aero Diary</AeroTitle>
            <p className="mt-1 text-sm font-semibold text-[#2b4c73] drop-shadow">
              July 2026
            </p>
          </div>
          <button
            type="button"
            className="aero-btn flex h-10 w-10 items-center justify-center rounded-full pb-2 text-lg shadow-lg"
            aria-label="New entry"
          >
            +
          </button>
        </header>

        <div className="space-y-4">
          {entries.map((entry) => (
            <article
              key={entry.id}
              className="aero-glass cursor-pointer p-4 transition-transform duration-200 hover:scale-[1.02]"
            >
              <div className="relative z-10 flex flex-row items-start gap-4">
                <div className="flex flex-col items-center pt-1">
                  <AeroOrb mood={entry.mood} className="text-white drop-shadow-md" />
                </div>
                <div className="flex-1 space-y-1">
                  <div className="mb-2 flex items-baseline justify-between border-b border-white/40 pb-1">
                    <h3 className="text-lg font-bold text-[#0a2f5c]">{entry.day}</h3>
                    <span className="text-xs font-bold text-[#2b4c73]">{entry.time}</span>
                  </div>
                  <p className="line-clamp-2 text-sm font-medium leading-relaxed text-[#1a2c42]">
                    {entry.note}
                  </p>
                  <div className="mt-3 flex gap-2">
                    {entry.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full border border-white bg-white/60 px-2 py-0.5 text-xs font-bold text-[#0a2f5c] shadow-sm"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
      <AeroDock />
    </>
  )
}