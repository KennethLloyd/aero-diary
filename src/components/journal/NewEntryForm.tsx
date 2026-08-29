'use client';

import Link from 'next/link';
import Image from 'next/image';
import {
  startTransition,
  useActionState,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ChangeEvent,
  type MouseEvent,
} from 'react';
import { formatJournalDate, getTodayDateKey, parseJournalDate, type JournalDate } from '@/lib/journal/dates';
import {
  createEntry,
  deletePhoto,
  updateEntry,
  type EntryActionState,
} from '@/actions/entries';
import { polishEntry, type PolishEntryState } from '@/actions/polish';
import { AeroButton } from '@/components/aero/AeroButton';
import { AeroOrb } from '@/components/aero/AeroOrb';
import { Mood } from '@/generated/prisma/enums';
import {
  MAX_PHOTO_COUNT,
} from '@/lib/journal/photos';
import {
  createPhotoUploadQueue,
  removeStagedPhoto,
  removeStagedPhotoByKey,
  uploadStagedPhoto,
} from '@/lib/journal/photo-upload';
import type { ActivityOption } from '@/lib/journal/types';
import { rankEditableActivities, EDIT_ACTIVITY_PREVIEW_SIZE } from '@/lib/journal/activity-ranking';
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
function createClientKey() {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}


export type EditableEntryPhoto = {
  id: string
  removing?: boolean
}

export type EditableEntry = {
  id: string
  journalDate: JournalDate
  mood: Mood
  note: string
  activityIds: string[]
  photos: EditableEntryPhoto[]
}

type StagedPhoto = {
  clientKey: string
  file: File
  name: string
  url: string
  status: 'uploading' | 'ready' | 'failed' | 'removing'
  id?: string
  error?: string
}

export function NewEntryForm({
  activities = [],
  entry,
  todayDateKey,
}: {
  activities?: ActivityOption[]
  entry?: EditableEntry
  todayDateKey?: JournalDate
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
  const [selectedJournalDate, setSelectedJournalDate] = useState<JournalDate>();
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
  const [showAllActivities, setShowAllActivities] = useState(false);
  const [existingPhotos, setExistingPhotos] = useState<EditableEntryPhoto[]>(
    () => entry?.photos ?? [],
  );
  const [stagedPhotos, setStagedPhotos] = useState<StagedPhoto[]>([]);
  const [photoError, setPhotoError] = useState<string>();
  const [draftKey, setDraftKey] = useState(entry?.id ?? '');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const journalDateInput = useRef<HTMLInputElement>(null);
  const saveSentinelRef = useRef<HTMLDivElement>(null);
  const photoUploadQueueRef = useRef(createPhotoUploadQueue());
  const removedPhotoKeysRef = useRef(new Set<string>());
  const stagedPhotosRef = useRef(stagedPhotos);
  const draftKeyRef = useRef(draftKey);

  useEffect(() => {
    stagedPhotosRef.current = stagedPhotos;
  }, [stagedPhotos]);

  useEffect(() => {
    draftKeyRef.current = draftKey;
  }, [draftKey]);

  useEffect(() => () => {
    const staged = stagedPhotosRef.current;
    staged.forEach((photo) => {
      URL.revokeObjectURL(photo.url);
      removedPhotoKeysRef.current.add(photo.clientKey);
    });

    staged.forEach((photo) => {
      const cleanup = photo.id
        ? removeStagedPhoto(photo.id, true)
        : draftKeyRef.current
          ? removeStagedPhotoByKey(draftKeyRef.current, photo.clientKey, true)
          : Promise.resolve();
      void cleanup.catch((error: unknown) => {
        console.error('Unable to clean up a staged photo after leaving the entry form.', error);
      });
    });
  }, []);

  useEffect(() => {
    const sentinel = saveSentinelRef.current;
    if (
      !sentinel
      || typeof IntersectionObserver === 'undefined'
      || typeof MutationObserver === 'undefined'
    ) return;

    const root = sentinel.closest<HTMLElement>('.aero-screen-content');
    const observer = new IntersectionObserver(
      ([entry]) => {
        const isNearSave = entry?.isIntersecting ?? false;
        const dock = document.querySelector<HTMLElement>('.aero-dock[data-hide-near-save]');
        if (!dock) return;

        dock.classList.toggle('aero-dock-hidden', isNearSave);
        if (isNearSave) {
          dock.setAttribute('aria-hidden', 'true');
          dock.setAttribute('inert', '');
        } else {
          dock.removeAttribute('aria-hidden');
          dock.removeAttribute('inert');
        }
      },
      {
        root,
        rootMargin: '0px 0px -5% 0px',
        threshold: 0.25,
      },
    );

    const connectObserver = () => {
      const dock = document.querySelector('.aero-dock[data-hide-near-save]');
      if (!dock) return;
      observer.observe(sentinel);
      mutationObserver.disconnect();
    };
    const mutationObserver = new MutationObserver(connectObserver);
    mutationObserver.observe(document.body, { childList: true, subtree: true });
    connectObserver();

    return () => {
      mutationObserver.disconnect();
      observer.disconnect();
    };
  }, []);

  function toggleActivity(activityId: string) {
    setSelectedActivityIds((selected) => {
      const next = new Set(selected);
      if (next.has(activityId)) next.delete(activityId);
      else next.add(activityId);
      return next;
    });
  }

  function openJournalDatePicker() {
    const input = journalDateInput.current;
    if (!input) return;

    input.focus();
    if (typeof input.showPicker === 'function') {
      try {
        input.showPicker();
        return;
      } catch {
        // Fall back for browsers that require a visible native control.
      }
    }
    input.click();
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

  function removeLocalPhoto(clientKey: string) {
    const photo = stagedPhotosRef.current.find((item) => item.clientKey === clientKey);
    if (photo) URL.revokeObjectURL(photo.url);
    setStagedPhotos((current) => current.filter((item) => item.clientKey !== clientKey));
  }

  function queuePhoto(photo: StagedPhoto, photoDraftKey: string) {
    setStagedPhotos((current) => current.map((item) => (
      item.clientKey === photo.clientKey
        ? { ...item, status: 'uploading', error: undefined }
        : item
    )));

    void photoUploadQueueRef.current.enqueue(
      () => uploadStagedPhoto(photo.file, photoDraftKey, photo.clientKey),
    ).then(({ id }) => {
      if (removedPhotoKeysRef.current.has(photo.clientKey)) {
        void removeStagedPhoto(id, true).catch((error) => {
          console.error('Unable to clean up a removed staged photo.', error);
        });
        return;
      }
      setStagedPhotos((current) => current.map((item) => (
        item.clientKey === photo.clientKey
          ? { ...item, id, status: 'ready', error: undefined }
          : item
      )));
    }).catch((error: unknown) => {
      if (removedPhotoKeysRef.current.has(photo.clientKey)) return;
      setStagedPhotos((current) => current.map((item) => (
        item.clientKey === photo.clientKey
          ? {
            ...item,
            status: 'failed',
            error: error instanceof Error ? error.message : 'Unable to upload this photo.',
          }
          : item
      )));
    });
  }

  function handlePhotoChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (!files || files.length === 0) return;

    setPhotoError(undefined);
    const available = MAX_PHOTO_COUNT - existingPhotos.length - stagedPhotos.length;
    if (available <= 0) {
      setPhotoError('This entry already has 10 photos.');
      return;
    }
    const activeDraftKey = draftKey || createClientKey();
    setDraftKey(activeDraftKey);

    const selected = Array.from(files).slice(0, available);
    if (selected.length < files.length) {
      setPhotoError(`Only ${available} photo slot${available === 1 ? '' : 's'} remain.`);
    }
    selected.forEach((file) => {
      const photo: StagedPhoto = {
        clientKey: createClientKey(),
        file,
        name: file.name,
        url: URL.createObjectURL(file),
        status: 'uploading',
      };
      setStagedPhotos((current) => [...current, photo]);
      queuePhoto(photo, activeDraftKey);
    });
  }

  function retryPhoto(photo: StagedPhoto) {
    removedPhotoKeysRef.current.delete(photo.clientKey);
    setPhotoError(undefined);
    queuePhoto(photo, draftKey);
  }

  function removePhoto(photo: StagedPhoto) {
    removedPhotoKeysRef.current.add(photo.clientKey);

    if (!photo.id) {
      const cleanup = draftKey
        ? removeStagedPhotoByKey(draftKey, photo.clientKey, true)
        : Promise.resolve();
      void cleanup.catch((error: unknown) => {
        console.error('Unable to clean up a removed staged photo.', error);
      });
      removeLocalPhoto(photo.clientKey);
      return;
    }

    if (photo.status === 'uploading' || photo.status === 'failed') {
      void removeStagedPhoto(photo.id, true).catch((error: unknown) => {
        console.error('Unable to clean up a removed staged photo.', error);
      });
      removeLocalPhoto(photo.clientKey);
      return;
    }

    setStagedPhotos((current) => current.map((item) => (
      item.clientKey === photo.clientKey ? { ...item, status: 'removing' } : item
    )));
    void removeStagedPhoto(photo.id).then(() => {
      removeLocalPhoto(photo.clientKey);
    }).catch((error: unknown) => {
      removedPhotoKeysRef.current.delete(photo.clientKey);
      setStagedPhotos((current) => current.map((item) => (
        item.clientKey === photo.clientKey
          ? {
            ...item,
            status: 'ready',
            error: error instanceof Error ? error.message : 'Unable to remove this photo.',
          }
          : item
      )));
      setPhotoError(error instanceof Error ? error.message : 'Unable to remove this photo.');
    });
  }

  function removeExistingPhoto(photoId: string) {
    if (!window.confirm('Remove this photo permanently?')) return;
    setExistingPhotos((current) => current.map((photo) => (
      photo.id === photoId ? { ...photo, removing: true } : photo
    )));
    startTransition(async () => {
      try {
        const result = await deletePhoto(photoId, undefined, new FormData());
        if (result?.error) {
          setPhotoError(result.error);
          setExistingPhotos((current) => current.map((photo) => (
            photo.id === photoId ? { ...photo, removing: undefined } : photo
          )));
          return;
        }
        setExistingPhotos((current) => current.filter((photo) => photo.id !== photoId));
      } catch {
        setPhotoError('Unable to remove your photo. Please try again.');
        setExistingPhotos((current) => current.map((photo) => (
          photo.id === photoId ? { ...photo, removing: undefined } : photo
        )));
      }
    });
  }

  const totalPhotoCount = existingPhotos.length + stagedPhotos.length;
  const uploadingPhotoCount = stagedPhotos.filter((photo) => photo.status === 'uploading').length;
  const removingPhotoCount = stagedPhotos.filter((photo) => photo.status === 'removing').length;
  const removingExistingPhoto = existingPhotos.some((photo) => photo.removing);

  const selectedMoodObj = MOODS.find((m) => m.value === mood) ?? MOODS[3];
  const rankedActivities = entry
    ? rankEditableActivities(activities, selectedActivityIds)
    : [];
  const selectedActivityCount = rankedActivities.filter((activity) => (
    selectedActivityIds.has(activity.id)
  )).length;
  const collapsedActivityCount = selectedActivityCount + EDIT_ACTIVITY_PREVIEW_SIZE;
  const visibleActivities = showAllActivities
    ? rankedActivities
    : rankedActivities.slice(0, collapsedActivityCount);
  const hiddenActivityCount = Math.max(0, rankedActivities.length - collapsedActivityCount);

  return (
    <div className="aero-entry-shell">
      <form
        id="entry-form"
        action={formAction}
        className="aero-entry-form aero-card flex min-h-0 flex-1 flex-col gap-6 p-5 sm:p-6"
      >
        <input type="hidden" name="mood" value={mood} />
        <input type="hidden" name="draftKey" value={draftKey} />
        {[...selectedActivityIds].map((activityId) => (
          <input key={activityId} type="hidden" name="activityId" value={activityId} />
        ))}
        {stagedPhotos
          .filter((photo): photo is StagedPhoto & { id: string } => photo.status === 'ready' && Boolean(photo.id))
          .map((photo) => (
            <input key={photo.clientKey} type="hidden" name="stagedPhotoId" value={photo.id} />
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
                <span>{formatJournalDate(entry.journalDate, browserTodayDate)}</span>
              ) : (
                <>
                  <span>{formatJournalDate(journalDate, browserTodayDate)}</span>
                  <button
                    type="button"
                    className="aero-date-change"
                    aria-controls="journal-date"
                    aria-label="Change journal date"
                    onClick={openJournalDatePicker}
                  >
                    <span aria-hidden="true">Change date</span>
                  </button>
                  <input
                    ref={journalDateInput}
                    id="journal-date"
                    name="journalDate"
                    type="date"
                    className="aero-date-input"
                    value={journalDate}
                    max={browserTodayDate}
                    required
                    tabIndex={-1}
                    aria-hidden="true"
                    onChange={(event) => setSelectedJournalDate(
                      event.target.value ? parseJournalDate(event.target.value) : undefined,
                    )}
                  />
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

        {entry ? (
          <section className="relative z-10 space-y-2.5" aria-labelledby="activity-heading">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="activity-heading" className="text-xs font-bold uppercase tracking-wider text-[#2b4c73]">
                  Activities
                </h2>
                <p className="mt-1 text-xs font-medium text-[#2b4c73]">
                  Refine the tags suggested for this memory.
                </p>
              </div>
              <Link
                href="/activities"
                className="shrink-0 text-xs font-semibold text-[#144e9d] hover:underline"
              >
                Manage tags
              </Link>
            </div>
            {activities.length > 0 ? (
              <>
                <div id="activity-options" className="flex flex-wrap gap-1.5">
                  {visibleActivities.map((activity) => {
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
                      </button>
                    );
                  })}
                </div>
                {hiddenActivityCount > 0 ? (
                  <button
                    type="button"
                    className="aero-link-control text-xs font-bold underline"
                    aria-controls="activity-options"
                    aria-expanded={showAllActivities}
                    onClick={() => setShowAllActivities((showingAll) => !showingAll)}
                  >
                    {showAllActivities ? 'Show less' : 'Show more'}
                    <span className="sr-only">
                      {showAllActivities
                        ? ' activities'
                        : ` activities (${hiddenActivityCount} more)`}
                    </span>
                  </button>
                ) : null}
              </>
            ) : (
              <div className="rounded-xl border border-white/60 bg-white/40 p-3 text-xs font-semibold text-[#2b4c73]">
                No activities created yet.{' '}
                <Link href="/activities" className="font-bold text-[#144e9d] underline">
                  Add your favorite activities
                </Link>{' '}
                to tag this memory.
              </div>
            )}
          </section>
        ) : null}

        {/* 4. Photos Picker */}
        <section className="relative z-10 space-y-2.5" aria-labelledby="photo-heading">
          <div className="flex items-center justify-between gap-3">
            <h2
              id="photo-heading"
              className="block text-xs font-bold uppercase tracking-wider text-[#2b4c73]"
            >
              Photos (optional)
            </h2>
            <span className="text-xs font-bold text-[#2b4c73]" aria-live="polite">
              {totalPhotoCount} of {MAX_PHOTO_COUNT} photos
            </span>
          </div>

          <input
            ref={fileInputRef}
            id="entry-photos"
            aria-label="Select photos"
            type="file"
            accept="image/jpeg,image/png,image/heic,image/heif,.heic,.heif"
            multiple
            className="sr-only"
            onChange={handlePhotoChange}
          />

          <div className="flex flex-wrap gap-2">
            {existingPhotos.map((photo, index) => (
              <div
                key={`existing-${photo.id}`}
                className="group relative h-16 w-16 overflow-hidden rounded-xl border border-white bg-white/70 shadow-sm"
              >
                <Image
                  src={`/photos/${photo.id}`}
                  alt={`Attached photo ${index + 1}`}
                  fill
                  unoptimized
                  className="object-cover"
                />
                <button
                  type="button"
                  onClick={() => removeExistingPhoto(photo.id)}
                  disabled={photo.removing || pending || removingExistingPhoto}
                  className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full border border-white/90 bg-[#0a2f5c]/70 text-xs font-bold leading-none text-white shadow-sm transition hover:bg-red-600 active:scale-90 disabled:cursor-not-allowed disabled:opacity-60"
                  aria-label={`Remove attached photo ${index + 1}`}
                >
                  {photo.removing ? '…' : <span aria-hidden="true">×</span>}
                </button>
              </div>
            ))}

            {stagedPhotos.map((photo) => (
              <div
                key={photo.clientKey}
                className="group relative h-16 w-16 overflow-hidden rounded-xl border border-white bg-white/70 shadow-sm"
              >
                <Image
                  src={photo.url}
                  alt={photo.name}
                  fill
                  unoptimized
                  className={`object-cover ${photo.status === 'failed' ? 'opacity-45' : ''}`}
                />
                {photo.status === 'uploading' ? (
                  <span
                    role="status"
                    className="absolute inset-x-0 bottom-0 bg-[#0a2f5c]/80 px-1 py-0.5 text-center text-[9px] font-bold text-white"
                  >
                    Uploading…
                  </span>
                ) : null}
                {photo.status === 'removing' ? (
                  <span
                    role="status"
                    className="absolute inset-x-0 bottom-0 bg-[#0a2f5c]/80 px-1 py-0.5 text-center text-[9px] font-bold text-white"
                  >
                    Removing…
                  </span>
                ) : null}
                {photo.status === 'failed' ? (
                  <>
                    <span
                      role="status"
                      className="absolute inset-x-0 bottom-0 bg-amber-900/85 px-1 py-0.5 text-center text-[9px] font-bold text-white"
                    >
                      Upload failed
                    </span>
                    <button
                      type="button"
                      onClick={() => retryPhoto(photo)}
                      className="absolute inset-x-1 bottom-1 rounded-full bg-amber-100/95 px-1 py-0.5 text-[9px] font-bold text-amber-900 shadow-sm"
                    >
                      Retry
                    </button>
                  </>
                ) : null}
                <button
                  type="button"
                  onClick={() => removePhoto(photo)}
                  disabled={photo.status === 'removing'}
                  className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full border border-white/90 bg-[#0a2f5c]/70 text-xs font-bold leading-none text-white shadow-sm transition hover:bg-red-600 active:scale-90 disabled:cursor-not-allowed disabled:opacity-60"
                  aria-label={`Remove ${photo.name}`}
                >
                  <span aria-hidden="true">×</span>
                </button>
              </div>
            ))}

            {totalPhotoCount < MAX_PHOTO_COUNT ? (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex h-16 w-16 flex-col items-center justify-center gap-0.5 rounded-xl border border-dashed border-[#7da8cc] bg-white/55 text-[#0a2f5c] shadow-xs transition hover:bg-white/85 active:scale-95"
                aria-label={totalPhotoCount > 0 ? 'Add more photos' : 'Add photos'}
              >
                <span className="text-xl" aria-hidden="true">📷</span>
                <span className="text-[10px] font-bold">{totalPhotoCount > 0 ? 'Add more' : 'Add photos'}</span>
              </button>
            ) : null}
          </div>

          {uploadingPhotoCount > 0 ? (
            <p role="status" className="text-xs font-semibold text-[#2b4c73]">
              {uploadingPhotoCount} photo{uploadingPhotoCount === 1 ? '' : 's'} still uploading. Saving will be available when the transfer finishes.
            </p>
          ) : null}
          {photoError ? (
            <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50/95 px-3 py-2 text-xs font-semibold text-amber-800">
              {photoError}
            </p>
          ) : null}
          {uploadingPhotoCount === 0 && removingPhotoCount === 0 && totalPhotoCount < MAX_PHOTO_COUNT ? (
            <p className="text-xs font-medium text-[#2b4c73]">
              Select JPEG, PNG, or HEIC photos. Transfers continue while you write.
            </p>
          ) : null}
        </section>

        {state?.error ? (
          <p role="alert" className="relative z-10 rounded-xl border border-red-300 bg-red-50/95 px-4 py-2.5 text-sm font-semibold text-red-700">
            {state.error}
          </p>
        ) : null}

        <div ref={saveSentinelRef} data-entry-save-sentinel className="relative z-10 pt-2">
          <AeroButton
            type="submit"
            disabled={pending || uploadingPhotoCount > 0 || removingPhotoCount > 0 || removingExistingPhoto}
            className="w-full py-3 text-base shadow-md"
          >
            {pending
              ? 'Saving memory…'
              : uploadingPhotoCount > 0
                ? 'Waiting for photos…'
                : entry ? 'Save changes' : 'Save entry'}
          </AeroButton>
        </div>
      </form>
    </div>
  );
}
