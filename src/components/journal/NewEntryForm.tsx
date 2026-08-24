'use client';

import Link from 'next/link';
import Image from 'next/image';
import {
  startTransition,
  useActionState,
  useRef,
  useState,
  useSyncExternalStore,
  type ChangeEvent,
  type MouseEvent,
} from 'react';
import { formatJournalDate, getTodayDateKey } from '@/lib/journal/dates';
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

const DATE_CHANGE_EVENTS = ['focus', 'visibilitychange', 'pageshow'] as const;

function subscribeToDateChanges(onChange: () => void) {
  DATE_CHANGE_EVENTS.forEach((event) => window.addEventListener(event, onChange));
  return () => DATE_CHANGE_EVENTS.forEach((event) => window.removeEventListener(event, onChange));
}


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
  todayDateKey,
}: {
  activities: ActivityOption[]
  entry?: EditableEntry
  todayDateKey?: string
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
  const initialTodayDateKey = todayDateKey ?? getTodayDateKey();
  const browserTodayDate = useSyncExternalStore(
    subscribeToDateChanges,
    getTodayDateKey,
    () => initialTodayDateKey,
  );
  const [selectedJournalDate, setSelectedJournalDate] = useState<string>();
  const journalDate = selectedJournalDate ?? browserTodayDate;
  const [polishState, setPolishState] = useState<PolishEntryState>();
  const [polishing, setPolishing] = useState(false);
  const [mood, setMood] = useState<Mood>(entry?.mood ?? Mood.GOOD);
  const [note, setNote] = useState(entry?.note ?? '');
  const [polishSnapshot, setPolishSnapshot] = useState<{
    original: string
    polished: string
  }>();
  const [showingOriginal, setShowingOriginal] = useState(false);
  const [selectedActivityIds, setSelectedActivityIds] = useState<Set<string>>(
    () => new Set(entry?.activityIds ?? []),
  );
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<{ name: string; url: string }[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const localOffsetInput = useRef<HTMLInputElement>(null);
  const journalDateInput = useRef<HTMLInputElement>(null);

  function toggleActivity(activityId: string) {
    setSelectedActivityIds((selected) => {
      const next = new Set(selected);
      if (next.has(activityId)) next.delete(activityId);
      else next.add(activityId);
      return next;
    });
  }

  function setBrowserOffset() {
    if (entry) return;
    const now = new Date();
    const browserOffset = -now.getTimezoneOffset();
    if (localOffsetInput.current) {
      localOffsetInput.current.value = String(browserOffset);
    }
    if (selectedJournalDate === undefined && journalDateInput.current) {
      const currentBrowserDate = getTodayDateKey(now, browserOffset);
      journalDateInput.current.value = currentBrowserDate;
      journalDateInput.current.max = currentBrowserDate;
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

  function handlePhotoChange(event: ChangeEvent<HTMLInputElement>) {
    const files = event.target.files;
    if (!files || files.length === 0) {
      clearPhotos();
      return;
    }
    const selected = Array.from(files);
    setPhotoFiles(selected);
    setPhotoPreviews(selected.map((file) => ({ name: file.name, url: URL.createObjectURL(file) })));
  }

  function removePhoto(index: number) {
    const nextFiles = photoFiles.filter((_, current) => current !== index);
    URL.revokeObjectURL(photoPreviews[index]?.url ?? '');
    setPhotoFiles(nextFiles);
    setPhotoPreviews((current) => current.filter((_, currentIndex) => currentIndex !== index));
    syncFileInput(nextFiles);
  }

  function syncFileInput(files: File[]) {
    if (!fileInputRef.current) return;
    const transfer = new DataTransfer();
    files.forEach((file) => transfer.items.add(file));
    fileInputRef.current.files = transfer.files;
  }

  function clearPhotos() {
    photoPreviews.forEach((preview) => URL.revokeObjectURL(preview.url));
    setPhotoFiles([]);
    setPhotoPreviews([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  const selectedMoodObj = MOODS.find((m) => m.value === mood) ?? MOODS[3];

  return (
    <div className="aero-entry-shell">
      <form
        id="entry-form"
        action={formAction}
        onSubmit={setBrowserOffset}
        className="aero-entry-form aero-card flex min-h-0 flex-1 flex-col gap-6 p-5 sm:p-6"
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

        {/* Form header navigation */}
        <header className="relative z-10 flex items-center gap-2.5 border-b border-white/60 pb-3">
          <Link
            href="/timeline"
            className="aero-icon-btn h-9 w-9"
            aria-label="Back to timeline without saving"
          >
            <span aria-hidden="true">‹</span>
          </Link>
          <div className="min-w-0">
            <h1 className="text-base font-bold tracking-tight text-[#0a2f5c] drop-shadow-sm">
              {entry ? 'Edit Entry' : 'New Entry'}
            </h1>
            <p className="flex flex-wrap items-center gap-2 text-xs font-semibold text-[#2b4c73]">
              {entry ? (
                'Updating a saved memory'
              ) : (
                <>
                  <span>{formatJournalDate(journalDate, browserTodayDate)}</span>
                  <label htmlFor="journal-date" className="aero-date-change">
                    <span>Change date</span>
                    <input
                      ref={journalDateInput}
                      id="journal-date"
                      name="journalDate"
                      type="date"
                      value={journalDate}
                      max={browserTodayDate}
                      required
                      aria-label="Journal date"
                      onChange={(event) => setSelectedJournalDate(event.target.value)}
                    />
                  </label>
                </>
              )}
            </p>
          </div>
        </header>

        {/* 1. Mood Selector */}
        <section className="relative z-10 space-y-3 text-center" aria-labelledby="mood-heading">
          <h2 id="mood-heading" className="text-sm font-bold uppercase tracking-wider text-[#2b4c73]">
            How was your day?
          </h2>
          <div className="aero-mood-selector mx-auto max-w-xs rounded-2xl border border-white/80 bg-white/40 p-2 shadow-inner sm:max-w-sm sm:p-2.5">
            {MOODS.map((option) => {
              const selected = mood === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  className={`aero-mood-option relative flex items-center justify-center rounded-full transition-all duration-200 active:scale-95 ${
                    selected
                      ? 'scale-110 ring-2 ring-[#146cc2] ring-offset-2 ring-offset-white/80 [&_.aero-orb]:drop-shadow-[0_0_10px_rgba(74,155,230,0.6)]'
                      : 'opacity-75 hover:opacity-100'
                  }`}
                  aria-label={`Select ${option.label} mood`}
                  aria-pressed={selected}
                  onClick={() => setMood(option.value)}
                >
                  <AeroOrb mood={option.value} className="aero-mood-orb" />
                </button>
              );
            })}
          </div>
          <p className="text-sm font-bold text-[#0a2f5c] drop-shadow-sm">
            Feeling <span className="underline decoration-[#4a9be6] decoration-2">{selectedMoodObj.label}</span>
          </p>
        </section>

        {/* 2. Journal Input */}
        <div className="relative z-10 flex flex-1 flex-col gap-2">
          <label htmlFor="entry-note" className="text-xs font-bold uppercase tracking-wider text-[#2b4c73]">
            Journal Note
          </label>
          <textarea
            id="entry-note"
            name="note"
            className="aero-input min-h-44 w-full resize-y rounded-xl border-white/80 bg-white/95 p-4 text-[15px] leading-relaxed text-[#1a2c42] placeholder:text-[#8ba2b8] sm:min-h-52 sm:text-base"
            placeholder="What’s on your mind today?"
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

          {/* Polish Helper Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <button
              type="button"
              onClick={handlePolish}
              disabled={pending || polishing || !note.trim()}
              className="inline-flex items-center gap-1.5 rounded-full border border-sky-300/80 bg-sky-100/70 px-3 py-1.5 text-xs font-bold text-[#0f5499] shadow-sm transition hover:bg-sky-200/80 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span>✨</span>
              <span>{polishing ? 'Polishing…' : 'Polish writing'}</span>
            </button>
            {polishSnapshot ? (
              <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-[#144e9d]">
                <button type="button" onClick={toggleOriginal} className="aero-link-control text-xs font-bold underline">
                  {showingOriginal ? 'Show polished' : 'Show original'}
                </button>
                <button type="button" onClick={undoPolish} className="aero-link-control text-xs font-bold underline">
                  Undo polish
                </button>
              </div>
            ) : null}
          </div>

          {polishState?.error ? (
            <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50/95 px-3 py-2 text-xs font-semibold text-amber-800">
              {polishState.error}
            </p>
          ) : null}
        </div>

        {/* 3. Activities Selector */}
        <section className="relative z-10 space-y-2.5" aria-labelledby="activity-heading">
          <div className="flex items-center justify-between">
            <h2 id="activity-heading" className="text-xs font-bold uppercase tracking-wider text-[#2b4c73]">
              What did you do today?
            </h2>
            <Link
              href="/activities"
              className="text-xs font-semibold text-[#144e9d] hover:underline"
            >
              Manage tags
            </Link>
          </div>
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
                    <span>{activity.emoji}</span>
                    <span>{activity.name}</span>
                    {selected ? <span className="ml-1 text-xs" aria-hidden="true">✓</span> : null}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-white/60 bg-white/40 p-3 text-xs font-semibold text-[#2b4c73]">
              No activities created yet.{' '}
              <Link href="/activities" className="font-bold text-[#144e9d] underline">
                Add your favorite activities
              </Link>{' '}
              to quickly tag memories.
            </div>
          )}
        </section>

        {/* 4. Photos Picker */}
        <section className="relative z-10 space-y-2.5" aria-labelledby="photo-heading">
          <label
            htmlFor="entry-photos"
            id="photo-heading"
            className="block text-xs font-bold uppercase tracking-wider text-[#2b4c73]"
          >
            Photos (optional)
          </label>

          <input
            ref={fileInputRef}
            id="entry-photos"
            name="photo"
            type="file"
            accept="image/jpeg,image/png,image/heic,image/heif,.heic,.heif"
            multiple
            className="sr-only"
            onChange={handlePhotoChange}
          />

          <div className="flex flex-wrap gap-2">
            {photoPreviews.map((preview, index) => (
              <div
                key={`${preview.name}-${index}`}
                className="group relative h-16 w-16 overflow-hidden rounded-xl border border-white bg-white/70 shadow-sm"
              >
                <Image
                  src={preview.url}
                  alt={preview.name}
                  fill
                  unoptimized
                  className="object-cover"
                />
                <button
                  type="button"
                  onClick={() => removePhoto(index)}
                  className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full border border-white/90 bg-[#0a2f5c]/70 text-xs font-bold leading-none text-white shadow-sm transition hover:bg-red-600 active:scale-90"
                  aria-label={`Remove ${preview.name}`}
                >
                  <span aria-hidden="true">×</span>
                </button>
              </div>
            ))}

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex h-16 w-16 flex-col items-center justify-center gap-0.5 rounded-xl border border-dashed border-[#7da8cc] bg-white/55 text-[#0a2f5c] shadow-xs transition hover:bg-white/85 active:scale-95"
              aria-label={photoPreviews.length > 0 ? 'Add more photos' : 'Add photos'}
            >
              <span className="text-xl" aria-hidden="true">📷</span>
              <span className="text-[10px] font-bold">{photoPreviews.length > 0 ? 'Add more' : 'Add photos'}</span>
            </button>
          </div>

          <p className="text-xs font-medium text-[#2b4c73]">
            Up to 10 photos per entry (JPEG, PNG, HEIC).
          </p>
        </section>

        {state?.error ? (
          <p role="alert" className="relative z-10 rounded-xl border border-red-300 bg-red-50/95 px-4 py-2.5 text-sm font-semibold text-red-700">
            {state.error}
          </p>
        ) : null}

        {/* 5. Primary Save Button (desktop / inline) */}
        <div className="relative z-10 hidden pt-2 sm:block">
          <AeroButton
            type="submit"
            disabled={pending}
            className="w-full py-3 text-base shadow-md"
          >
            {pending ? 'Saving memory…' : entry ? 'Save changes' : 'Save entry'}
          </AeroButton>
        </div>
      </form>

      {/* Mobile Action Bar */}
      <div className="aero-action-bar" aria-label="Entry actions">
        <AeroButton
          type="submit"
          form="entry-form"
          disabled={pending}
          className="flex-1 text-sm"
        >
          {pending ? 'Saving memory…' : entry ? 'Save changes' : 'Save entry'}
        </AeroButton>
      </div>
    </div>
  );
}
