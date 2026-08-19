import { AeroBubbles } from '@/components/aero/AeroBubbles'
import { AeroDock } from '@/components/aero/AeroDock'
import { AeroTitle } from '@/components/aero/AeroTitle'
import { CalendarGrid } from '@/components/journal/CalendarGrid'
import { MonthNavigator } from '@/components/journal/MonthNavigator'
import {
  buildCalendarGrid,
  getMonthFromParam,
} from '@/lib/journal/analytics'
import { listEntriesForMonth } from '@/lib/journal/queries'
import { verifySession } from '@/lib/dal'

export const dynamic = 'force-dynamic'

type CalendarPageProps = {
  searchParams: Promise<{ month?: string | string[] | undefined }>
}

export default async function CalendarPage({ searchParams }: CalendarPageProps) {
  await verifySession()
  const { month: monthParam } = await searchParams
  const month = getMonthFromParam(monthParam)
  const entries = await listEntriesForMonth(month)
  const days = buildCalendarGrid(entries, month)

  return (
    <>
      <AeroBubbles />
      <main className="aero-page relative z-10 mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-6 pb-32 md:pt-10 md:pb-32">
        <header className="px-2">
          <AeroTitle>Calendar</AeroTitle>
          <p className="mt-1 text-sm font-semibold text-[#2b4c73] drop-shadow">
            Monthly Overview
          </p>
        </header>

        <section className="aero-glass flex flex-col gap-4 p-4" aria-labelledby="calendar-heading">
          <h2 id="calendar-heading" className="sr-only">Calendar for selected month</h2>
          <MonthNavigator basePath="/calendar" month={month} />
          <CalendarGrid days={days} />
          <p className="text-center text-xs font-semibold text-[#2b4c73]">
            Tap a day with a mood orb to open its entry.
          </p>
        </section>
      </main>
      <AeroDock />
    </>
  )
}
