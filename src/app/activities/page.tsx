import { AeroBubbles } from '@/components/aero/AeroBubbles'
import { AeroDock } from '@/components/aero/AeroDock'
import { AeroTitle } from '@/components/aero/AeroTitle'
import { ActivityManager } from '@/components/journal/ActivityManager'
import { verifySession } from '@/lib/dal'
import { listActivities } from '@/lib/journal/queries'

export const dynamic = 'force-dynamic'

export default async function ActivitiesPage() {
  await verifySession()
  const activities = await listActivities()

  return (
    <>
      <AeroBubbles />
      <main className="relative z-10 mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-5 px-4 py-6 pb-32 md:pt-10 md:pb-32">
        <header className="px-2">
          <AeroTitle>Activities</AeroTitle>
          <p className="mt-1 text-sm font-semibold text-[#2b4c73] drop-shadow">
            Shape the tags that make your memories searchable.
          </p>
        </header>
        <ActivityManager activities={activities} />
      </main>
      <AeroDock />
    </>
  )
}
