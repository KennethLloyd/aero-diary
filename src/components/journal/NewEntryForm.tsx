'use client';

import Link from 'next/link';
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
import { AeroOrb } from '@/components/aero/AeroOrb';
import { Mood } from '@/generated/prisma/enums';
import type { ActivityOption } from '@/lib/journal/types';

const MOODS: { value: Mood; label: string }[] = [
  { value: Mood.AWFUL, label: 'Awful' },
  { value: Mood.BAD, label: 'Bad' },
  { value: Mood.MEH, label: 'Meh' },
  { value: Mood.GOOD, label: 'Good' },
  { value: Mood.RAD, label: 'Rad' },
];

export type EditableEntry = {
  id: string
  mood: Mood
  note: string
  localOffset: number
  activityIds: string[]
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
  const [selectedPhotoNames, setSelectedPhotoNames] = useState<string[]>([]);
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
    <form
      action={formAction}
      onSubmit={setBrowserOffset}
      className="aero-entry-form aero-glass flex flex-1 flex-col p-5"
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

      <header className="relative z-10 mb-6 flex items-center justify-between border-b border-white/50 pb-3">
        <Link
          href="/timeline"
          className="aero-link-control text-sm font-bold text-[#144e9d] drop-shadow-md hover:underline"
        >
          Cancel
        </Link>
        <span className="text-sm font-bold tracking-wide text-[#0a2f5c] drop-shadow-md">
          {entry ? 'Edit Entry' : 'New Entry'}
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
          <div className="mx-auto grid w-full max-w-sm grid-cols-5 justify-items-center gap-1 rounded-2xl border border-black/10 bg-black/5 p-2 shadow-inner sm:gap-4 sm:p-3">
            {MOODS.map((option) => {
              const selected = mood === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                    className={`flex min-h-11 min-w-11 items-center justify-center rounded-full p-0.5 ${selected ? 'ring-2 ring-white ring-offset-2 ring-offset-transparent' : ''}`}
                  aria-label={`Select ${option.label} mood`}
                  aria-pressed={selected}
                  onClick={() => setMood(option.value)}
                >
                  <AeroOrb mood={option.value} className="aero-mood-orb" />
                </button>
              );
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
            value={note}
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

          {selectedActivityIds.size > 0 ? (
            <p className="rounded-lg border border-white/60 bg-white/40 px-3 py-2 text-sm font-semibold text-[#2b4c73]" aria-live="polite">
              Selected activities:{' '}
              {activities
                .filter((activity) => selectedActivityIds.has(activity.id))
                .map((activity) => `${activity.emoji} ${activity.name}`)
                .join(', ')}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <AeroButton
              type="button"
              onClick={handlePolish}
              disabled={pending || polishing || !note.trim()}
              className="px-3 py-1 text-xs"
            >
              {polishing ? 'Polishing…' : 'Polish ✨'}
            </AeroButton>
            {polishSnapshot ? (
              <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-[#144e9d]">
                <button type="button" onClick={toggleOriginal} className="underline">
                  {showingOriginal ? 'Show polished' : 'Show original'}
                </button>
                <button type="button" onClick={undoPolish} className="underline">
                  Undo polish
                </button>
              </div>
            ) : null}
          </div>

          {polishState?.error ? (
            <p role="alert" className="rounded-md border border-amber-300 bg-amber-50/90 px-3 py-2 text-sm font-semibold text-amber-800">
              {polishState.error}
            </p>
          ) : null}

          <section className="space-y-2 rounded-lg border border-white/60 bg-white/40 p-3" aria-labelledby="activity-heading">
            <h2 id="activity-heading" className="text-xs font-bold uppercase text-[#0a2f5c]">
              Activities
            </h2>
            {activities.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {activities.map((activity) => {
                  const selected = selectedActivityIds.has(activity.id);
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
                  );
                })}
              </div>
            ) : (
              <p className="text-sm font-semibold text-[#2b4c73]">
                Add activities from the Activities screen first.
              </p>
            )}
          </section>

          <section className="space-y-2 rounded-lg border border-white/60 bg-white/40 p-3" aria-labelledby="photo-heading">
            <label htmlFor="entry-photos" className="block text-xs font-bold uppercase text-[#0a2f5c]">
              Photos (optional)
            </label>
            <input
              id="entry-photos"
              name="photo"
              type="file"
              accept="image/jpeg,image/png,image/heic,image/heif,.heic,.heif"
              multiple
              className="block min-h-11 w-full text-sm font-semibold text-[#2b4c73] file:mr-3 file:min-h-11 file:rounded-md file:border file:border-[#7a9eae] file:bg-white file:px-3 file:py-1.5 file:font-bold file:text-[#144e9d]"
              onChange={(event) => setSelectedPhotoNames([...event.target.files ?? []].map((file) => file.name))}
            />
            <p className="text-xs font-semibold text-[#2b4c73]">
              Up to 10 JPEG, PNG, HEIC, or HEIF photos, 10 MB each (20 MB total).
            </p>
            {selectedPhotoNames.length > 0 ? (
              <p className="text-xs font-semibold text-[#0a2f5c]" aria-live="polite">
                Selected: {selectedPhotoNames.join(', ')}
              </p>
            ) : null}
          </section>

          {state?.error ? (
            <p role="alert" className="rounded-md border border-red-300 bg-red-50/80 px-3 py-2 text-sm font-semibold text-red-700">
              {state.error}
            </p>
          ) : null}

          <div className="aero-action-bar" aria-label="Entry actions">
            <Link href="/timeline" className="aero-link-control font-bold text-[#144e9d]">
              Cancel
            </Link>
            <AeroButton type="submit" disabled={pending} className="px-5 text-sm">
              {pending ? 'Saving…' : 'Save'}
            </AeroButton>
          </div>
        </div>
      </div>
    </form>
  );
}
