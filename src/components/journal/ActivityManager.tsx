'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import {
  createActivity,
  deleteActivity,
  restoreActivity,
  updateActivity,
  type ActivityState,
} from '@/actions/activities';
import { AeroButton } from '@/components/aero/AeroButton';
import { AeroDialog } from '@/components/aero/AeroDialog';
import type { ActivityOption } from '@/lib/journal/types';

function ActionFeedback({ state }: { state: ActivityState }) {
  if (state?.error) {
    return <p role="alert" className="w-full text-xs font-bold text-red-600 sm:basis-full">{state.error}</p>;
  }
  if (state?.success) {
    return <p role="status" className="w-full text-xs font-bold text-green-700 sm:basis-full">{state.success}</p>;
  }
  return null;
}

// Compact ⋯ menu with outside-click and Escape dismissal.
function RowMenu({
  label,
  onEdit,
  onArchive,
}: {
  label: string
  onEdit: () => void
  onArchive: () => void
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative flex-none">
      <button
        type="button"
        className="aero-icon-btn"
        aria-label={`Actions for ${label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span aria-hidden="true">⋯</span>
      </button>
      {open ? (
        <div className="aero-menu" role="menu" aria-label={`Actions for ${label}`}>
          <button
            type="button"
            role="menuitem"
            className="aero-menu-item"
            onClick={() => {
              setOpen(false);
              onEdit();
            }}
          >
            <span aria-hidden="true">✏️</span>
            <span>Edit</span>
          </button>
          <button
            type="button"
            role="menuitem"
            className="aero-menu-item aero-menu-item-danger"
            onClick={() => {
              setOpen(false);
              onArchive();
            }}
          >
            <span aria-hidden="true">🗄️</span>
            <span>Archive</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}

function ActivityRow({ activity }: { activity: ActivityOption }) {
  const [isEditing, setIsEditing] = useState(false);
  const [state, formAction, pending] = useActionState<ActivityState, FormData>(
    updateActivity.bind(null, activity.id),
    undefined,
  );
  const [draft, setDraft] = useState({ name: activity.name, emoji: activity.emoji });
  const [archiveOpen, setArchiveOpen] = useState(false);
  const accessibleName = draft.name.trim() || activity.name;

  return (
    <>
      <li className="flex items-center gap-2.5 rounded-xl border border-transparent p-1.5 transition hover:border-white/70 hover:bg-white/55">
        {!isEditing ? (
          <>
            <span className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-white/70 text-lg shadow-inner">
              {activity.emoji}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-bold text-[#0a2f5c]">
              {activity.name}
            </span>
            <RowMenu
              label={activity.name}
              onEdit={() => setIsEditing(true)}
              onArchive={() => setArchiveOpen(true)}
            />
          </>
        ) : (
          <form
            action={async (formData) => {
              await formAction(formData);
              setIsEditing(false);
            }}
            className="flex w-full min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center"
          >
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <input
                name="emoji"
                aria-label={`${accessibleName} emoji`}
                className="aero-input h-9 w-14 flex-none text-center text-base"
                value={draft.emoji}
                onChange={(event) => setDraft((current) => ({ ...current, emoji: event.target.value }))}
                maxLength={16}
                required
              />
              <input
                name="name"
                aria-label={`${accessibleName} name`}
                className="aero-input h-9 min-w-0 flex-1 text-sm font-semibold"
                value={draft.name}
                onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                maxLength={50}
                required
              />
            </div>
            <div className="flex flex-none items-center justify-end gap-1.5">
              <AeroButton type="submit" disabled={pending} className="h-9 px-3 py-0 text-xs">
                {pending ? 'Saving…' : 'Save'}
              </AeroButton>
              <button
                type="button"
                onClick={() => {
                  setDraft({ name: activity.name, emoji: activity.emoji });
                  setIsEditing(false);
                }}
                className="aero-btn aero-btn-white h-9 px-2.5 py-0 text-xs font-semibold"
              >
                Cancel
              </button>
            </div>
            <ActionFeedback state={state} />
          </form>
        )}
      </li>

      <AeroDialog
        open={archiveOpen}
        title="Archive activity"
        titleId={`archive-activity-${activity.id}`}
        description={`Archive "${activity.emoji} ${activity.name}"? It will disappear from future new entries while remaining safely on existing memories.`}
        onClose={() => setArchiveOpen(false)}
      >
        <div className="aero-modal-actions -mx-1 mt-4 -mb-1">
          <button type="button" className="aero-modal-cancel" onClick={() => setArchiveOpen(false)}>
            Keep it
          </button>
          <form action={deleteActivity.bind(null, activity.id)} onSubmit={() => setArchiveOpen(false)}>
            <AeroButton variant="red" type="submit" className="px-4 text-xs">
              Archive
            </AeroButton>
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
    <li className="flex items-center justify-between gap-2.5 rounded-xl border border-transparent p-1.5">
      <div className="flex min-w-0 items-center gap-2">
        <span className="text-base opacity-75">{activity.emoji}</span>
        <span className="truncate text-xs font-bold text-[#2b4c73]">
          {activity.name}
        </span>
      </div>
      <form action={formAction} className="shrink-0">
        <AeroButton variant="white" type="submit" disabled={pending} className="px-3 py-1 text-xs">
          {pending ? 'Restoring…' : 'Restore'}
        </AeroButton>
        <ActionFeedback state={state} />
      </form>
    </li>
  );
}

// Collapsed-by-default composer that expands into an inline row.
// Stays open after adding so several activities can be created in a row;
// React resets the uncontrolled fields after each successful action.
function ActivityComposer() {
  const [expanded, setExpanded] = useState(false);
  const [state, formAction, pending] = useActionState<ActivityState, FormData>(
    createActivity,
    undefined,
  );

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="aero-link-control w-full justify-start gap-2 rounded-xl px-3 text-sm font-bold text-[#144e9d] hover:bg-sky-50/80"
      >
        <span className="text-base" aria-hidden="true">＋</span>
        <span>New activity</span>
      </button>
    );
  }

  return (
    <form
      action={formAction}
      className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2"
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <div className="w-14 flex-none">
          <label htmlFor="activity-emoji" className="sr-only">Emoji</label>
          <input
            id="activity-emoji"
            name="emoji"
            className="aero-input h-9 w-full text-center text-base"
            placeholder="✨"
            maxLength={16}
            required
            autoFocus
          />
        </div>
        <div className="min-w-0 flex-1">
          <label htmlFor="activity-name" className="sr-only">Activity name</label>
          <input
            id="activity-name"
            name="name"
            className="aero-input h-9 w-full text-sm font-medium"
            placeholder="e.g. Hiking, Reading, Cooking"
            maxLength={50}
            required
          />
        </div>
      </div>
      <div className="flex flex-none items-center justify-end gap-1.5">
        <AeroButton type="submit" disabled={pending} className="h-9 px-4 py-0 text-xs font-bold">
          {pending ? 'Adding…' : 'Add'}
        </AeroButton>
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="aero-btn aero-btn-white h-9 px-2.5 py-0 text-xs font-semibold"
        >
          Cancel
        </button>
      </div>
      <ActionFeedback state={state} />
    </form>
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
    <div className="flex flex-col gap-4">
      {/* 1. Active list with inline composer */}
      <section className="aero-surface-plain p-3 sm:p-4" aria-labelledby="activities-list-heading">
        <div className="mb-2 flex items-center justify-between px-1.5">
          <h2 id="activities-list-heading" className="text-sm font-bold tracking-tight text-[#0a2f5c]">
            Your activities
          </h2>
          <span className="text-xs font-semibold text-[#2b4c73]">{activities.length} {activities.length === 1 ? 'tag' : 'tags'}</span>
        </div>

        {activities.length > 0 ? (
          <ul className="divide-y divide-sky-100/70">
            {activities.map((activity) => (
              <ActivityRow key={activity.id} activity={activity} />
            ))}
          </ul>
        ) : (
          <div className="rounded-xl p-3 text-center text-xs font-semibold text-[#2b4c73]">
            No activities yet. Add your first one below to start tagging memories.
          </div>
        )}

        <div className="mt-1.5 border-t border-sky-100/80 pt-1.5">
          <ActivityComposer />
        </div>
      </section>

      {/* 2. Archived Activities */}
      {archivedActivities.length > 0 ? (
        <section className="aero-surface-plain p-3 sm:p-4" aria-labelledby="archived-activities-heading">
          <div className="mb-2 px-1.5">
            <h2 id="archived-activities-heading" className="text-sm font-bold tracking-tight text-[#0a2f5c]">
              Archived
            </h2>
            <p className="mt-0.5 text-xs font-medium text-[#2b4c73]">
              Hidden from new entries but still visible on older memories.
            </p>
          </div>
          <ul className="divide-y divide-sky-100/70">
            {archivedActivities.map((activity) => (
              <ArchivedActivityRow key={activity.id} activity={activity} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
