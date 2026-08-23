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
      <section className="aero-glass p-8 text-center">
        <h2 className="text-xl font-bold text-[#0a2f5c]">
          {filter.mood || filter.activityId ? 'No matching memories yet.' : 'Your timeline is waiting.'}
        </h2>
        <p className="mt-2 text-sm font-semibold text-[#2b4c73]">
          {filter.mood || filter.activityId
            ? 'Try another filter or return to your full timeline.'
            : 'Capture how today feels and your first memory will appear here.'}
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Link href="/timeline/new" className="aero-btn">New entry</Link>
          {filter.mood || filter.activityId ? (
            <Link href="/timeline" className="aero-btn aero-btn-white">View all entries</Link>
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {entries.map((entry) => (
          <Link
            key={entry.id}
            href={`/timeline/${entry.id}`}
            className="aero-glass block p-4 transition-transform duration-200 hover:scale-[1.02]"
          >
            <div className="relative z-10 timeline-entry-layout">
              <div className="timeline-entry-meta">
                <AeroOrb mood={entry.mood} className="text-white drop-shadow-md" />
                <div className="timeline-entry-date-group">
                  <h3 className="text-lg font-bold leading-tight text-[#0a2f5c]">{entry.date}</h3>
                  <time dateTime={entry.dateTime} className="shrink-0 text-xs font-bold text-[#2b4c73]">
                    {entry.time}
                  </time>
                </div>
              </div>
              <div className="timeline-entry-body">
                <p className="line-clamp-4 whitespace-pre-line text-sm font-medium leading-relaxed text-[#1a2c42]">
                  {entry.note}
                </p>
                {entry.tags.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-1.5 sm:gap-2" aria-label="Activities">
                    {entry.tags.slice(0, 2).map((tag) => (
                      <span
                        key={tag.id}
                        role="img"
                        aria-label={`${tag.emoji} ${tag.name}`}
                        title={tag.name}
                        className="flex min-h-8 items-center justify-center rounded-full border border-white bg-white/60 px-2 py-1 text-xs font-bold leading-tight text-[#0a2f5c] shadow-sm"
                      >
                        <span aria-hidden="true">{tag.emoji}</span>
                        <span className="sr-only sm:hidden">{tag.name}</span>
                        <span className="hidden sm:inline">&nbsp;{tag.name}</span>
                      </span>
                    ))}
                    {entry.tags.length > 2 ? (
                      <span
                        className="flex min-h-8 items-center rounded-full border border-white/70 bg-white/40 px-2 py-1 text-xs font-bold text-[#2b4c73]"
                        aria-label={`More activities: ${entry.tags.slice(2).map((tag) => tag.name).join(', ')}`}
                        title={entry.tags.slice(2).map((tag) => tag.name).join(', ')}
                      >
                        +{entry.tags.length - 2} more
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
        <div ref={sentinelRef} className="flex min-h-16 items-center justify-center" aria-live="polite">
          {isPending ? (
            <p className="text-sm font-semibold text-[#2b4c73]">Loading older entries…</p>
          ) : loadError ? (
            <div className="flex flex-col items-center gap-2">
              <p className="text-sm font-semibold text-red-700">{loadError}</p>
              <button
                type="button"
                className="aero-link-control text-sm font-bold text-[#144e9d] underline decoration-dotted underline-offset-4"
                onClick={loadMore}
              >
                Try again
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="aero-link-control text-sm font-bold text-[#144e9d] underline decoration-dotted underline-offset-4"
              onClick={loadMore}
            >
              Load older entries
            </button>
          )}
        </div>
      ) : (
        <p className="py-4 text-center text-xs font-semibold text-[#2b4c73]">You’re all caught up.</p>
      )}
    </>
  );
}
