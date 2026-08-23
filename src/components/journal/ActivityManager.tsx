'use client';

import { useActionState, useState } from 'react';
import {
  createActivity,
  deleteActivity,
  updateActivity,
  type ActivityState,
} from '@/actions/activities';
import { AeroButton } from '@/components/aero/AeroButton';
import { AeroDialog } from '@/components/aero/AeroDialog';
import type { ActivityOption } from '@/lib/journal/types';

function ActionFeedback({ state }: { state: ActivityState }) {
  if (state?.error) {
    return <p role="alert" className="col-span-full basis-full text-sm font-semibold text-red-700">{state.error}</p>;
  }
  if (state?.success) {
    return <p className="col-span-full basis-full text-sm font-semibold text-green-800">{state.success}</p>;
  }
  return null;
}

function ActivityEditor({ activity }: { activity: ActivityOption }) {
  const [state, formAction, pending] = useActionState<ActivityState, FormData>(
    updateActivity.bind(null, activity.id),
    undefined,
  );
  const [draft, setDraft] = useState({ name: activity.name, emoji: activity.emoji });
  const [savedDraft, setSavedDraft] = useState({ name: activity.name, emoji: activity.emoji });
  const [archiveOpen, setArchiveOpen] = useState(false);
  const dirty = draft.name !== savedDraft.name || draft.emoji !== savedDraft.emoji || Boolean(state?.error);

  return (
    <>
      <form
        action={formAction}
        onSubmit={() => setSavedDraft(draft)}
        className="grid min-w-0 flex-1 grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-2 sm:flex sm:flex-wrap"
      >
        <input
          name="emoji"
          aria-label={`${activity.name} emoji`}
          className="aero-input w-full text-center sm:w-16"
          value={draft.emoji}
          onChange={(event) => setDraft((current) => ({ ...current, emoji: event.target.value }))}
          maxLength={16}
          required
        />
        <input
          name="name"
          aria-label={`${activity.name} name`}
          className="aero-input min-w-0 flex-1 sm:min-w-40"
          value={draft.name}
          onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
          maxLength={50}
          required
        />
        <div className="col-span-full flex justify-end gap-2 sm:contents">
          {dirty ? (
            <AeroButton type="submit" disabled={pending} className="px-3 text-sm">
              {pending ? 'Saving…' : 'Save'}
            </AeroButton>
          ) : null}
          <AeroButton
            variant="white"
            type="button"
            className="px-3 text-sm text-[#7a1010]"
            onClick={() => setArchiveOpen(true)}
          >
            Archive
          </AeroButton>
        </div>
        <ActionFeedback state={state} />
      </form>

      <AeroDialog
        open={archiveOpen}
        title="Archive activity"
        titleId={`archive-activity-${activity.id}`}
        description={`Archive ${activity.emoji} ${activity.name}? It will disappear from new entries but remain on older memories.`}
        onClose={() => setArchiveOpen(false)}
      >
        <div className="aero-modal-actions -mx-1 mt-4 -mb-1">
          <button type="button" className="aero-modal-cancel" onClick={() => setArchiveOpen(false)}>
            Keep it
          </button>
          <form action={deleteActivity.bind(null, activity.id)} onSubmit={() => setArchiveOpen(false)}>
            <AeroButton variant="red" type="submit" className="px-4 text-sm">Archive</AeroButton>
          </form>
        </div>
      </AeroDialog>
    </>
  );
}

export function ActivityManager({ activities }: { activities: ActivityOption[] }) {
  const [state, formAction, pending] = useActionState<ActivityState, FormData>(
    createActivity,
    undefined,
  );

  return (
    <div className="space-y-5">
      <form
        action={formAction}
        className="aero-glass grid grid-cols-[4.5rem_minmax(0,1fr)] items-end gap-3 p-4 sm:flex sm:flex-wrap"
      >
        <div className="min-w-0 flex-1 sm:min-w-20">
          <label htmlFor="activity-emoji" className="mb-1 block text-xs font-bold uppercase text-[#0a2f5c]">Emoji</label>
          <input id="activity-emoji" name="emoji" className="aero-input w-full" placeholder="✨" maxLength={16} required />
        </div>
        <div className="min-w-0 flex-[3] sm:min-w-48">
          <label htmlFor="activity-name" className="mb-1 block text-xs font-bold uppercase text-[#0a2f5c]">Activity name</label>
          <input id="activity-name" name="name" className="aero-input w-full" placeholder="Activity name" maxLength={50} required />
        </div>
        <AeroButton type="submit" disabled={pending} className="col-span-full w-full px-4 sm:col-span-auto sm:w-auto">
          {pending ? 'Adding…' : 'Add activity'}
        </AeroButton>
        <ActionFeedback state={state} />
      </form>

      <section className="aero-glass p-4" aria-labelledby="activities-list-heading">
        <div className="mb-3 border-b border-white/40 pb-2 sm:flex sm:items-center sm:justify-between">
          <div>
            <h2 id="activities-list-heading" className="text-lg font-bold text-[#0a2f5c]">Your activities</h2>
            <p className="mt-1 text-xs font-semibold text-[#2b4c73]">
              Edit a row when it changes; archive removes it from new entries while preserving history.
            </p>
          </div>
          <span className="mt-2 text-xs font-bold text-[#2b4c73] sm:mt-0">{activities.length} active</span>
        </div>
        {activities.length > 0 ? (
          <ul className="space-y-2">
            {activities.map((activity) => (
              <li key={activity.id} className="flex items-center gap-2 rounded-lg border border-white/60 bg-white/40 p-2">
                <ActivityEditor activity={activity} />
              </li>
            ))}
          </ul>
        ) : (
          <div className="recovery-state rounded-lg p-4 text-sm font-semibold text-[#2b4c73]">
            No activities yet. Add one above to make entries easier to browse.
          </div>
        )}
      </section>
    </div>
  );
}
