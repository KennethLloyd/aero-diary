'use client';

import {
  startTransition,
  useActionState,
  useRef,
  useState,
  type MouseEvent,
} from 'react';
import {
  createEntry,
  updateEntry,
  type EntryActionState,
} from '@/actions/entries';
import { polishEntry, type PolishEntryState } from '@/actions/polish';
import { AeroButton } from '@/components/aero/AeroButton';
import { AeroChip } from '@/components/aero/AeroChip';
import { AeroTextarea } from '@/components/aero/AeroTextarea';
import { EntryBackButton } from '@/components/journal/EntryBackButton';
import { MoodOrbPicker } from '@/components/journal/MoodOrbPicker';
import { PhotoUploader } from '@/components/journal/PhotoUploader';
import { Mood } from '@/generated/prisma/enums';
import type { ActivityOption } from '@/lib/journal/types';

export type EditableEntry = {
  id: string
  mood: Mood
  note: string
  localOffset: number
  activityIds: string[]
}

function formatDateSubtitle(entry?: EditableEntry): string {
  // For new entries, show today's date; for edits, show the entry's stored date
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
  return entry
    ? formatter.format(new Date(now.getTime() + (entry.localOffset ?? 0) * 60_000))
    : `Today, ${formatter.format(now)}`;
}

export function NewEntryForm({
  activities,
  entry,
}: {
  activities: ActivityOption[]
  entry?: EditableEntry
}) {
  const action: (
    prevState: EntryActionState,
    formData: FormData,
  ) => Promise<EntryActionState> = entry
    ? updateEntry.bind(null, entry.id)
    : createEntry;
  const [state, formAction, pending] = useActionState<EntryActionState, FormData>(
    action,
    undefined,
  );
  const [polishState, setPolishState] = useState<PolishEntryState>();
  const [polishing, setPolishing] = useState(false);
  const [mood, setMood] = useState<Mood>(entry?.mood ?? Mood.RAD);
  const [note, setNote] = useState(entry?.note ?? '');
  const [polishSnapshot, setPolishSnapshot] = useState<{
    original: string
    polished: string
  }>();
  const [showingOriginal, setShowingOriginal] = useState(false);
  const [selectedActivityIds, setSelectedActivityIds] = useState<Set<string>>(
    () => new Set(entry?.activityIds ?? []),
  );
  const localOffsetInput = useRef<HTMLInputElement>(null);

  function toggleActivity(activityId: string) {
    setSelectedActivityIds((selected) => {
      const next = new Set(selected);
      if (next.has(activityId)) next.delete(activityId);
      else next.add(activityId);
      return next;
    });
  }

  function setBrowserOffset() {
    if (!entry && localOffsetInput.current) {
      localOffsetInput.current.value = String(-new Date().getTimezoneOffset());
    }
  }

  function toggleOriginal() {
    if (!polishSnapshot) return;
    const nextShowingOriginal = !showingOriginal;
    setShowingOriginal(nextShowingOriginal);
    setNote(nextShowingOriginal ? polishSnapshot.original : polishSnapshot.polished);
  }

  function undoPolish() {
    if (!polishSnapshot) return;
    setNote(polishSnapshot.original);
    setPolishSnapshot(undefined);
    setShowingOriginal(false);
  }

  function handlePolish(event: MouseEvent<HTMLButtonElement>) {
    const formElement = event.currentTarget.form;
    if (!formElement) return;
    const originalNote = note;
    setPolishing(true);
    setPolishState(undefined);

    startTransition(async () => {
      try {
        const result = await polishEntry(undefined, new FormData(formElement));
        setPolishState(result);
        if (result?.revisedText) {
          setPolishSnapshot({ original: originalNote, polished: result.revisedText });
          setShowingOriginal(false);
          setNote(result.revisedText);
        }
      } finally {
        setPolishing(false);
      }
    });
  }

  return (
    <div className="aero-entry-shell">
      <form
        id="entry-form"
        action={formAction}
        onSubmit={setBrowserOffset}
        className="aero-entry-form relative z-10 mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 pb-32 pt-4 sm:gap-10 sm:px-6 sm:pt-6 md:pt-10"
      >
        <input type="hidden" name="mood" value={mood} />
        <input
          ref={localOffsetInput}
          type="hidden"
          name="localOffset"
          defaultValue={entry?.localOffset ?? 0}
        />
        {[...selectedActivityIds].map((activityId) => (
          <input key={activityId} type="hidden" name="activityId" value={activityId} />
        ))}

        {/* Sticky header */}
        <header className="sticky top-0 z-20 -mx-4 mb-2 flex items-center justify-between gap-3 border-b border-white/60 bg-gradient-to-b from-[rgba(255,255,255,0.85)] to-[rgba(255,255,255,0.55)] px-4 py-3 backdrop-blur-md sm:-mx-6 sm:px-6">
          <EntryBackButton />
          <h1 className="min-w-0 flex-1 truncate text-center text-xl font-bold text-[#0a2f5c] drop-shadow-md sm:text-2xl">
            {entry ? 'Edit Entry' : 'New Entry'}
          </h1>
          <AeroButton
            type="submit"
            tone="primary"
            size="md"
            disabled={pending}
            className="hidden sm:inline-flex"
          >
            {pending ? 'Saving...' : 'Save entry'}
          </AeroButton>
        </header>

        {/* Date subtitle */}
        <p className="text-sm font-semibold text-[#2b4c73]">
          {formatDateSubtitle(entry)}
        </p>

        {/* Mood section */}
        <section aria-labelledby="mood-heading">
          <h2
            id="mood-heading"
            className="mb-3 text-sm font-bold uppercase tracking-wide text-[#5a7194]"
          >
            How are you feeling?
          </h2>
          <MoodOrbPicker value={mood} onChange={setMood} />
        </section>

        {/* Journal textarea */}
        <section aria-labelledby="note-heading">
          <h2 id="note-heading" className="sr-only">
            Journal note
          </h2>
          <AeroTextarea
            name="note"
            placeholder="What's on your mind?"
            minLength={1}
            maxLength={20_000}
            value={note}
            className="min-h-56"
            onChange={(event) => {
              setNote(event.target.value);
              if (polishSnapshot) {
                setPolishSnapshot(
                  showingOriginal
                    ? { ...polishSnapshot, original: event.target.value }
                    : { ...polishSnapshot, polished: event.target.value },
                );
              }
            }}
            required
          />
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs text-[#5a7194]">
              {note.length.toLocaleString()} / 20,000
            </span>
            <button
              type="button"
              onClick={handlePolish}
              disabled={pending || polishing || !note.trim()}
              className="text-sm font-bold text-[#144e9d] underline decoration-dotted underline-offset-4 transition hover:text-[#0a2f5c] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {polishing ? 'Polishing...' : '\u2728 Polish writing'}
            </button>
          </div>
          {polishSnapshot ? (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-bold text-[#144e9d]">
              <button
                type="button"
                onClick={toggleOriginal}
                className="aero-link-control underline"
              >
                {showingOriginal ? 'Show polished' : 'Show original'}
              </button>
              <button
                type="button"
                onClick={undoPolish}
                className="aero-link-control underline"
              >
                Undo polish
              </button>
            </div>
          ) : null}
          {polishState?.error ? (
            <p
              role="alert"
              className="mt-2 rounded-md border border-amber-300 bg-amber-50/90 px-3 py-2 text-sm font-semibold text-amber-800"
            >
              {polishState.error}
            </p>
          ) : null}
        </section>

        {/* Activities */}
        <section aria-labelledby="activity-heading">
          <h2
            id="activity-heading"
            className="mb-3 text-sm font-bold uppercase tracking-wide text-[#5a7194]"
          >
            What did you do today?
          </h2>
          {activities.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {activities.map((activity) => (
                <AeroChip
                  key={activity.id}
                  tone={selectedActivityIds.has(activity.id) ? 'selected' : 'neutral'}
                  size="sm"
                  onClick={() => toggleActivity(activity.id)}
                >
                  <span aria-hidden="true">{activity.emoji}</span>
                  <span>{activity.name}</span>
                </AeroChip>
              ))}
            </div>
          ) : (
            <p className="text-sm font-semibold text-[#5a7194]">
              No activities yet.{' '}
              <a
                href="/settings/activities"
                className="text-[#144e9d] underline decoration-dotted underline-offset-4 hover:text-[#0a2f5c]"
              >
                Add some from Settings.
              </a>
            </p>
          )}
        </section>

        {/* Photos */}
        <section aria-labelledby="photo-heading">
          <h2
            id="photo-heading"
            className="mb-3 text-sm font-bold uppercase tracking-wide text-[#5a7194]"
          >
            Photos (optional)
          </h2>
          <PhotoUploader />
        </section>

        {/* Error */}
        {state?.error ? (
          <p
            role="alert"
            className="rounded-md border border-red-300 bg-red-50/80 px-3 py-2 text-sm font-semibold text-red-700"
          >
            {state.error}
          </p>
        ) : null}
      </form>

      {/* Mobile sticky bottom save bar */}
      <div className="aero-action-bar" aria-label="Entry actions">
        <AeroButton
          type="submit"
          form="entry-form"
          tone="primary"
          size="lg"
          disabled={pending}
          className="w-full"
        >
          {pending ? 'Saving...' : 'Save entry'}
        </AeroButton>
      </div>
    </div>
  );
}
