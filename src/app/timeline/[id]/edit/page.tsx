import { notFound } from 'next/navigation'
import { AeroBubbles } from '@/components/aero/AeroBubbles'
import { AeroDock } from '@/components/aero/AeroDock'
import { AeroTitle } from '@/components/aero/AeroTitle'
import { NewEntryForm } from '@/components/journal/NewEntryForm'
import { db } from '@/lib/db'
import { verifySession } from '@/lib/dal'
import { entryIdSchema } from '@/lib/journal/schemas'
import { listActivities } from '@/lib/journal/queries'

export const dynamic = 'force-dynamic'

type EditEntryPageProps = {
  params: Promise<{ id: string }>
}

export default async function EditEntryPage({ params }: EditEntryPageProps) {
  const session = await verifySession()
  const { id } = await params
  const parsedId = entryIdSchema.safeParse(id)
  if (!parsedId.success) notFound()

  const [entry, activities] = await Promise.all([
    db.entry.findFirst({
      where: { id: parsedId.data, userId: session.userId },
      include: { activities: { select: { activityId: true } } },
    }),
    listActivities(),
  ])
  if (!entry) notFound()

  return (
    <>
      <AeroBubbles />
      <main className="relative z-10 mx-auto flex min-h-screen w-full max-w-2xl flex-col px-4 py-6 pb-32 md:pt-10 md:pb-32">
        <AeroTitle className="mb-4 px-2">Aero Diary</AeroTitle>
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
      </main>
      <AeroDock />
    </>
  )
}
