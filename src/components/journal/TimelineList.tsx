'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { loadTimelinePage } from '@/actions/timeline';
import { AeroOrb } from '@/components/aero/AeroOrb';
import type { TimelineFilter, TimelinePage } from '@/lib/journal/timeline';

export function TimelineList({
  initialPage,
  filter = {},
}: {
  initialPage: TimelinePage
  filter?: TimelineFilter
}) {
  const [entries, setEntries] = useState(initialPage.entries);
  const [nextCursor, setNextCursor] = useState(initialPage.nextCursor);
  const [loadError, setLoadError] = useState<string | undefined>();
  const [isPending, startTransition] = useTransition();
  const sentinelRef = useRef<HTMLDivElement>(null);

  const loadMore = useCallback(() => {
    if (!nextCursor || isPending) return;
    const cursor = nextCursor;
    startTransition(async () => {
      try {
        const page = await loadTimelinePage(cursor, filter);
        setEntries((current) => [...current, ...page.entries]);
        setNextCursor(page.nextCursor);
        setLoadError(undefined);
      } catch {
        setLoadError('Unable to load older entries. Please try again.');
      }
    });
  }, [filter, isPending, nextCursor, startTransition]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !nextCursor) return;
    const scrollRoot = sentinel.closest<HTMLElement>('.aero-screen-content');

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) loadMore();
      },
      { root: scrollRoot, rootMargin: '600px 0px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore, nextCursor]);

  if (entries.length === 0) {
    return (
      <section className="aero-card p-8 text-center">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-white/60 text-2xl shadow-inner">
          ✨
        </div>
        <h2 className="text-xl font-bold text-[#0a2f5c]">
          {filter.mood || filter.activityId ? 'No matching memories found' : 'Your journal is waiting'}
        </h2>
        <p className="mx-auto mt-2 max-w-sm text-sm font-medium text-[#2b4c73]">
          {filter.mood || filter.activityId
            ? 'Try adjusting your filters or return to your full memory timeline.'
            : 'Capture how today feels and your memories will be preserved here.'}
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2.5">
          <Link href="/timeline/new" className="aero-btn">
            + Write an entry
          </Link>
          {filter.mood || filter.activityId ? (
            <Link href="/timeline" className="aero-btn aero-btn-white">
              View all memories
            </Link>
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <>
      <div className="space-y-3 sm:space-y-3.5">
        {entries.map((entry) => (
          <Link
            key={entry.id}
            href={`/timeline/${entry.id}`}
            className="aero-card group block p-4 transition-all duration-200 hover:scale-[1.01] hover:shadow-lg active:scale-[0.99]"
          >
            <div className="relative z-10 timeline-entry-layout">
              {/* Left column: Mood Orb + Date */}
              <div className="timeline-entry-meta">
                <AeroOrb mood={entry.mood} className="drop-shadow" />
                <div className="timeline-entry-date-group">
                  <time
                    dateTime={entry.journalDate}
                    className="text-sm font-bold text-[#0a2f5c] sm:text-base"
                  >
                    {entry.date}
                  </time>
                </div>
              </div>

              {/* Right column: Note Excerpt + Activities */}
              <div className="timeline-entry-body flex flex-col justify-center">
                <p className="line-clamp-3 text-sm font-medium leading-relaxed text-[#1a2c42]">
                  {entry.note}
                </p>
                {entry.tags.length > 0 ? (
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5" aria-label="Activities">
                    {entry.tags.slice(0, 3).map((tag) => (
                      <span
                        key={tag.id}
                        role="img"
                        aria-label={`${tag.emoji} ${tag.name}`}
                        title={tag.name}
                        className="inline-flex items-center gap-1 rounded-full border border-white/80 bg-white/70 px-2 py-0.5 text-xs font-semibold text-[#0a2f5c] shadow-xs"
                      >
                        <span aria-hidden="true">{tag.emoji}</span>
                        <span>{tag.name}</span>
                      </span>
                    ))}
                    {entry.tags.length > 3 ? (
                      <span
                        className="inline-flex items-center rounded-full border border-white/60 bg-white/40 px-2 py-0.5 text-xs font-semibold text-[#2b4c73]"
                        aria-label={`More activities: ${entry.tags.slice(3).map((tag) => tag.name).join(', ')}`}
                        title={entry.tags.slice(3).map((tag) => tag.name).join(', ')}
                      >
                        +{entry.tags.length - 3} more
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          </Link>
        ))}
      </div>

      {nextCursor ? (
        <>
          <div ref={sentinelRef} className="h-px w-full" aria-hidden="true" />
          <div className="flex min-h-16 flex-col items-center justify-center gap-1" aria-live="polite">
            {loadError ? <p role="alert" className="text-sm font-semibold text-red-700">{loadError}</p> : null}
            <button
              type="button"
              disabled={isPending}
              className="aero-link-control text-sm font-bold text-[#144e9d] underline decoration-dotted underline-offset-4 disabled:cursor-wait disabled:opacity-60"
              onClick={loadMore}
            >
              {isPending ? 'Loading older memories…' : loadError ? 'Try again' : 'Load older memories'}
            </button>
          </div>
        </>
      ) : (
        <p className="py-4 text-center text-xs font-semibold text-[#2b4c73]/75">You’re all caught up with your memories.</p>
      )}
    </>
  );
}
