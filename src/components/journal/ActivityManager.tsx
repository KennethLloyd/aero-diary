'use client'

import { useActionState } from 'react'
import {
  createActivity,
  deleteActivity,
  updateActivity,
  type ActivityState,
} from '@/actions/activities'
import { AeroButton } from '@/components/aero/AeroButton'
import type { ActivityOption } from '@/lib/journal/types'

function ActionFeedback({ state }: { state: ActivityState }) {
  if (state?.error) {
    return (
      <p role="alert" className="basis-full text-sm font-semibold text-red-700">
        {state.error}
      </p>
    )
  }
  if (state?.success) {
    return <p className="basis-full text-sm font-semibold text-green-800">{state.success}</p>
  }
  return null
}

function ActivityEditor({ activity }: { activity: ActivityOption }) {
  const [state, formAction, pending] = useActionState<ActivityState, FormData>(
    updateActivity.bind(null, activity.id),
    undefined,
  )

  return (
    <form action={formAction} className="flex flex-1 flex-wrap items-center gap-2">
      <input
        name="emoji"
        aria-label={`${activity.name} emoji`}
        className="aero-input w-16 text-center"
        defaultValue={activity.emoji}
        maxLength={16}
        required
      />
      <input
        name="name"
        aria-label={`${activity.name} name`}
        className="aero-input min-w-40 flex-1"
        defaultValue={activity.name}
        maxLength={50}
        required
      />
      <AeroButton type="submit" disabled={pending} className="px-3 py-1 text-sm">
        {pending ? 'Saving…' : 'Save'}
      </AeroButton>
      <ActionFeedback state={state} />
    </form>
  )
}

export function ActivityManager({ activities }: { activities: ActivityOption[] }) {
  const [state, formAction, pending] = useActionState<ActivityState, FormData>(
    createActivity,
    undefined,
  )

  return (
    <div className="space-y-5">
      <form action={formAction} className="aero-glass flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-20 flex-1">
          <label htmlFor="activity-emoji" className="mb-1 block text-xs font-bold uppercase text-[#0a2f5c]">
            Emoji
          </label>
          <input
            id="activity-emoji"
            name="emoji"
            className="aero-input w-full"
            placeholder="✨"
            maxLength={16}
            required
          />
        </div>
        <div className="min-w-48 flex-[3]">
          <label htmlFor="activity-name" className="mb-1 block text-xs font-bold uppercase text-[#0a2f5c]">
            Activity name
          </label>
          <input
            id="activity-name"
            name="name"
            className="aero-input w-full"
            placeholder="Activity name"
            maxLength={50}
            required
          />
        </div>
        <AeroButton type="submit" disabled={pending} className="px-4 py-2">
          {pending ? 'Adding…' : 'Add activity'}
        </AeroButton>
        <ActionFeedback state={state} />
      </form>

      <section className="aero-glass p-4" aria-labelledby="activities-list-heading">
        <h2 id="activities-list-heading" className="mb-3 border-b border-white/40 pb-2 text-lg font-bold text-[#0a2f5c]">
          Your activities
        </h2>
        {activities.length > 0 ? (
          <ul className="space-y-2">
            {activities.map((activity) => (
              <li key={activity.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-white/60 bg-white/40 p-2">
                <ActivityEditor
                  key={`${activity.id}-${activity.name}-${activity.emoji}`}
                  activity={activity}
                />
                <form action={deleteActivity.bind(null, activity.id)}>
                  <AeroButton variant="red" type="submit" className="px-3 py-1 text-sm">
                    Archive
                  </AeroButton>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm font-semibold text-[#2b4c73]">
            No activities yet. Add one above.
          </p>
        )}
      </section>
    </div>
  )
}
