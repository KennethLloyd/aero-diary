'use client'

import Link from 'next/link'
import { useActionState, useRef, useState } from 'react'
import { createEntry, type CreateEntryState } from '@/app/actions/entries'
import { AeroButton } from '@/components/aero/AeroButton'
import { AeroOrb } from '@/components/aero/AeroOrb'
import { Mood } from '@/generated/prisma/enums'
import type { ActivityOption } from '@/lib/journal/types'

const MOODS: { value: Mood; label: string }[] = [
  { value: Mood.AWFUL, label: 'Awful' },
  { value: Mood.BAD, label: 'Bad' },
  { value: Mood.MEH, label: 'Meh' },
  { value: Mood.GOOD, label: 'Good' },
  { value: Mood.RAD, label: 'Rad' },
]

export function NewEntryForm({ activities }: { activities: ActivityOption[] }) {
  const [state, formAction, pending] = useActionState<CreateEntryState, FormData>(
    createEntry,
    undefined,
  )
  const [mood, setMood] = useState<Mood>(Mood.RAD)
  const [selectedActivityIds, setSelectedActivityIds] = useState<Set<string>>(
    new Set(),
  )
  const localOffsetInput = useRef<HTMLInputElement>(null)

  function toggleActivity(activityId: string) {
    setSelectedActivityIds((selected) => {
      const next = new Set(selected)
      if (next.has(activityId)) next.delete(activityId)
      else next.add(activityId)
      return next
    })
  }

  function setBrowserOffset() {
    if (localOffsetInput.current) {
      localOffsetInput.current.value = String(-new Date().getTimezoneOffset())
    }
  }

  return (
    <form
      action={formAction}
      onSubmit={setBrowserOffset}
      className="aero-glass flex flex-1 flex-col p-5"
    >
      <input type="hidden" name="mood" value={mood} />
      <input ref={localOffsetInput} type="hidden" name="localOffset" defaultValue="0" />
      {[...selectedActivityIds].map((activityId) => (
        <input key={activityId} type="hidden" name="activityId" value={activityId} />
      ))}

      <header className="relative z-10 mb-6 flex items-center justify-between border-b border-white/50 pb-3">
        <Link
          href="/timeline"
          className="text-sm font-bold text-[#144e9d] drop-shadow-md hover:underline"
        >
          Cancel
        </Link>
        <span className="text-sm font-bold tracking-wide text-[#0a2f5c] drop-shadow-md">
          New Entry
        </span>
        <AeroButton type="submit" disabled={pending} className="px-4 py-1 text-sm">
          {pending ? 'Saving…' : 'Save'}
        </AeroButton>
      </header>

      <div className="relative z-10 flex flex-1 flex-col gap-6">
        <section className="space-y-4 text-center" aria-labelledby="mood-heading">
          <h2 id="mood-heading" className="text-lg font-bold text-[#0a2f5c] drop-shadow-md">
            How are you feeling today?
          </h2>
          <div className="mx-auto flex w-fit justify-center gap-2 rounded-2xl border border-black/10 bg-black/5 p-3 shadow-inner sm:gap-4">
            {MOODS.map((option) => {
              const selected = mood === option.value
              return (
                <button
                  key={option.value}
                  type="button"
                  className={`rounded-full ${selected ? 'ring-2 ring-white ring-offset-2 ring-offset-transparent' : ''}`}
                  aria-label={`Select ${option.label} mood`}
                  aria-pressed={selected}
                  onClick={() => setMood(option.value)}
                >
                  <AeroOrb mood={option.value} />
                </button>
              )
            })}
          </div>
        </section>

        <div className="flex flex-1 flex-col gap-4">
          <label htmlFor="entry-note" className="sr-only">
            Note
          </label>
          <textarea
            id="entry-note"
            name="note"
            className="aero-input min-h-48 w-full resize-y p-4 text-[15px] leading-relaxed"
            placeholder="What’s on your mind?"
            maxLength={20_000}
            required
          />

          <section className="space-y-2 rounded-lg border border-white/60 bg-white/40 p-3" aria-labelledby="activity-heading">
            <h2 id="activity-heading" className="text-xs font-bold uppercase text-[#0a2f5c]">
              Activities
            </h2>
            {activities.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {activities.map((activity) => {
                  const selected = selectedActivityIds.has(activity.id)
                  return (
                    <button
                      key={activity.id}
                      type="button"
                      aria-pressed={selected}
                      className={`activity-chip ${selected ? 'activity-chip-selected' : ''}`}
                      onClick={() => toggleActivity(activity.id)}
                    >
                      {activity.emoji} {activity.name}
                    </button>
                  )
                })}
              </div>
            ) : (
              <p className="text-sm font-semibold text-[#2b4c73]">
                Add activities from the Activities screen first.
              </p>
            )}
          </section>

          {state?.error ? (
            <p role="alert" className="rounded-md border border-red-300 bg-red-50/80 px-3 py-2 text-sm font-semibold text-red-700">
              {state.error}
            </p>
          ) : null}
        </div>
      </div>
    </form>
  )
}
