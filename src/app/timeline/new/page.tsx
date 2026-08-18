import { AeroBubbles } from '@/components/aero/AeroBubbles'
import { AeroDock } from '@/components/aero/AeroDock'
import { AeroTitle } from '@/components/aero/AeroTitle'
import { NewEntryForm } from '@/components/journal/NewEntryForm'
import { verifySession } from '@/lib/dal'
import { listActivities } from '@/lib/journal/queries'

export const dynamic = 'force-dynamic'

export default async function NewEntryPage() {
  await verifySession()
  const activities = await listActivities()

  return (
    <>
      <AeroBubbles />
      <main className="aero-page relative z-10 mx-auto flex w-full max-w-2xl flex-col px-4 py-6 pb-32 md:pt-10 md:pb-32">
        <AeroTitle className="mb-4 px-2">Aero Diary</AeroTitle>
        <NewEntryForm activities={activities} />
      </main>
      <AeroDock />
    </>
  )
}
