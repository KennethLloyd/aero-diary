'use client';

import { useActionState, useState } from 'react';
import {
  createActivity,
  deleteActivity,
  restoreActivity,
  updateActivity,
  type ActivityState,
} from '@/actions/activities';
import { AeroButton } from '@/components/aero/AeroButton';
import { AeroCard } from '@/components/aero/AeroCard';
import { AeroDialog } from '@/components/aero/AeroDialog';
import { AeroField } from '@/components/aero/AeroField';
import { ActivityOverflowMenu } from '@/components/journal/ActivityOverflowMenu';
import type { ActivityOption } from '@/lib/journal/types';

function ActionFeedback({ state }: { state: ActivityState }) {
  if (state?.error) {
    return <p role="alert" className="mt-2 text-sm font-semibold text-red-700">{state.error}</p>;
  }
  if (state?.success) {
    return <p className="mt-2 text-sm font-semibold text-green-800">{state.success}</p>;
  }
  return null;
}

function AddActivityComposer() {
  const [state, formAction, pending] = useActionState<ActivityState, FormData>(
    createActivity,
    undefined,
  );
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('');

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/70 bg-white/30 px-4 py-3 text-sm font-bold text-[#144e9d] transition hover:bg-white/50"
      >
        <span aria-hidden="true">+</span>
        <span>Add activity</span>
      </button>
    );
  }

  return (
    <AeroCard tier="card" padded>
      <form action={formAction} className="space-y-3">
        <AeroField label="Emoji" htmlFor="activity-emoji">
          <input
            id="activity-emoji"
            name="emoji"
            value={emoji}
            onChange={(e) => setEmoji(e.target.value)}
            className="aero-input w-full text-center sm:w-20"
            placeholder="*"
            maxLength={16}
            required
          />
        </AeroField>
        <AeroField label="Name" htmlFor="activity-name">
          <input
            id="activity-name"
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="aero-input w-full"
            placeholder="Activity name"
            maxLength={50}
            required
          />
        </AeroField>
        <div className="flex justify-end gap-2">
          <AeroButton
            type="button"
            tone="ghost"
            size="md"
            onClick={() => {
              setOpen(false);
              setName('');
              setEmoji('');
            }}
          >
            Cancel
          </AeroButton>
          <AeroButton type="submit" tone="primary" size="md" disabled={pending || !name.trim()}>
            {pending ? 'Adding...' : 'Add'}
          </AeroButton>
        </div>
        <ActionFeedback state={state} />
      </form>
    </AeroCard>
  );
}

function EditActivityDialog({
  activity,
  onClose,
}: {
  activity: ActivityOption
  onClose: () => void
}) {
  const [state, formAction, pending] = useActionState<ActivityState, FormData>(
    updateActivity.bind(null, activity.id),
    undefined,
  );
  const [name, setName] = useState(activity.name);
  const [emoji, setEmoji] = useState(activity.emoji);

  return (
    <AeroDialog
      open
      onClose={onClose}
      title="Edit activity"
      titleId={`edit-activity-${activity.id}`}
    >
      <form action={formAction} className="space-y-3 px-5 py-4">
        <AeroField label="Emoji" htmlFor={`edit-activity-emoji-${activity.id}`}>
          <input
            id={`edit-activity-emoji-${activity.id}`}
            name="emoji"
            value={emoji}
            onChange={(e) => setEmoji(e.target.value)}
            className="aero-input w-full text-center sm:w-20"
            maxLength={16}
            required
          />
        </AeroField>
        <AeroField label="Name" htmlFor={`edit-activity-name-${activity.id}`}>
          <input
            id={`edit-activity-name-${activity.id}`}
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="aero-input w-full"
            maxLength={50}
            required
          />
        </AeroField>
        {state?.error ? <p role="alert" className="text-sm font-semibold text-red-700">{state.error}</p> : null}
        <div className="flex justify-end gap-2 pt-1">
          <AeroButton type="button" tone="ghost" size="md" onClick={onClose} disabled={pending}>
            Cancel
          </AeroButton>
          <AeroButton type="submit" tone="primary" size="md" disabled={pending || !name.trim()}>
            {pending ? 'Saving...' : 'Save'}
          </AeroButton>
        </div>
      </form>
    </AeroDialog>
  );
}

function ActivityRow({ activity }: { activity: ActivityOption }) {
  const [editOpen, setEditOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);

  return (
    <>
      <li className="flex items-center gap-3 rounded-xl border border-white/60 bg-white/40 px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]">
        <span className="text-2xl drop-shadow-sm" aria-hidden="true">{activity.emoji}</span>
        <span className="min-w-0 flex-1 truncate text-sm font-bold text-[#0a2f5c]">{activity.name}</span>
        <ActivityOverflowMenu
          label={`Options for ${activity.name}`}
          items={[
            { label: 'Edit', onClick: () => setEditOpen(true) },
            { label: 'Archive', onClick: () => setArchiveOpen(true), danger: true },
          ]}
        />
      </li>
      {editOpen ? (
        <EditActivityDialog activity={activity} onClose={() => setEditOpen(false)} />
      ) : null}
      <AeroDialog
        open={archiveOpen}
        onClose={() => setArchiveOpen(false)}
        title="Archive activity"
        titleId={`archive-activity-${activity.id}`}
        description={`Archive ${activity.emoji} ${activity.name}? It will disappear from new entries but remain on older memories.`}
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

function ArchivedActivityRow({ activity }: { activity: ActivityOption }) {
  const [state, formAction, pending] = useActionState<ActivityState, FormData>(
    restoreActivity.bind(null, activity.id),
    undefined,
  );

  return (
    <li className="flex items-center gap-3 rounded-xl border border-white/40 bg-white/25 px-3 py-2.5">
      <span className="text-2xl opacity-70" aria-hidden="true">{activity.emoji}</span>
      <span className="min-w-0 flex-1 truncate text-sm font-bold text-[#5a7194] line-through decoration-1">
        {activity.name}
      </span>
      <form action={formAction} className="shrink-0">
        <AeroButton tone="ghost" size="sm" type="submit" disabled={pending}>
          {pending ? 'Restoring...' : 'Restore'}
        </AeroButton>
        <ActionFeedback state={state} />
      </form>
    </li>
  );
}

export function ActivityManager({
  activities,
  archivedActivities = [],
}: {
  activities: ActivityOption[]
  archivedActivities?: ActivityOption[]
}) {
  return (
    <div className="space-y-5">
      <AddActivityComposer />

      <section aria-labelledby="activities-list-heading">
        <div className="mb-3 flex items-baseline justify-between px-1">
          <h2 id="activities-list-heading" className="text-xs font-bold uppercase tracking-wide text-[#5a7194]">
            Your activities
          </h2>
          <span className="text-xs font-bold text-[#5a7194]">{activities.length} active</span>
        </div>
        {activities.length > 0 ? (
          <ul className="space-y-2">
            {activities.map((activity) => (
              <ActivityRow key={activity.id} activity={activity} />
            ))}
          </ul>
        ) : (
          <AeroCard tier="card" padded>
            <p className="text-sm font-semibold text-[#5a7194]">
              No activities yet. Add one to make entries easier to browse.
            </p>
          </AeroCard>
        )}
      </section>

      {archivedActivities.length > 0 ? (
        <section aria-labelledby="archived-activities-heading">
          <h2 id="archived-activities-heading" className="mb-3 px-1 text-xs font-bold uppercase tracking-wide text-[#5a7194]">
            Archived
          </h2>
          <ul className="space-y-2">
            {archivedActivities.map((activity) => (
              <ArchivedActivityRow key={activity.id} activity={activity} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
