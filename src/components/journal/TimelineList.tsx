'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { loadTimelinePage } from '@/actions/timeline';
import { AeroOrb } from '@/components/aero/AeroOrb';
import type { TimelinePage } from '@/lib/journal/timeline';

export function TimelineList({ initialPage }: { initialPage: TimelinePage }) {
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
        const page = await loadTimelinePage(cursor);
        setEntries((current) => [...current, ...page.entries]);
        setNextCursor(page.nextCursor);
        setLoadError(undefined);
      } catch {
        setLoadError('Unable to load older entries. Please try again.');
      }
    });
  }, [isPending, nextCursor, startTransition]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !nextCursor) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) loadMore();
      },
      { rootMargin: '600px 0px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore, nextCursor]);

  if (entries.length === 0) {
    return (
      <section className="aero-glass p-8 text-center">
        <h2 className="text-xl font-bold text-[#0a2f5c]">Your timeline is waiting.</h2>
        <p className="mt-2 text-sm font-semibold text-[#2b4c73]">
          Capture how today feels and your first memory will appear here.
        </p>
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
            <div className="relative z-10 flex flex-row items-start gap-4">
              <div className="flex flex-col items-center pt-1">
                <AeroOrb mood={entry.mood} className="text-white drop-shadow-md" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-2 flex flex-col gap-0.5 border-b border-white/40 pb-2 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
                  <h3 className="text-lg font-bold leading-tight text-[#0a2f5c]">{entry.date}</h3>
                  <time dateTime={entry.dateTime} className="shrink-0 text-xs font-bold text-[#2b4c73]">
                    {entry.time}
                  </time>
                </div>
                <p className="line-clamp-4 whitespace-pre-line text-sm font-medium leading-relaxed text-[#1a2c42]">
                  {entry.note}
                </p>
                {entry.tags.length > 0 ? (
                  <div className="mt-3 grid max-h-14 grid-flow-col grid-rows-2 auto-cols-max gap-1.5 overflow-hidden sm:flex sm:max-h-none sm:flex-wrap sm:gap-2" aria-label="Activities">
                    {entry.tags.map((tag) => (
                      <span
                        key={tag.id}
                        role="img"
                        aria-label={tag.name}
                        title={tag.name}
                        className="flex h-6 items-center justify-center rounded-full border border-white bg-white/60 px-2 py-0.5 text-base font-bold leading-none text-[#0a2f5c] shadow-sm sm:h-auto sm:text-xs"
                      >
                        <span aria-hidden="true">{tag.emoji}</span>
                        <span className="sr-only sm:hidden">{tag.name}</span>
                        <span className="hidden sm:inline">&nbsp;{tag.name}</span>
                      </span>
                    ))}
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
                className="text-sm font-bold text-[#144e9d] underline decoration-dotted underline-offset-4"
                onClick={loadMore}
              >
                Try again
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="text-sm font-bold text-[#144e9d] underline decoration-dotted underline-offset-4"
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
