'use client';

import Image from 'next/image';
import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { DeletePhotoButton } from '@/components/journal/DeletePhotoButton';

export type PhotoGalleryPhoto = {
  id: string
}

export function PhotoGallery({ photos }: { photos: PhotoGalleryPhoto[] }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const activeIndexRef = useRef(activeIndex);
  const photosRef = useRef(photos);
  const viewerOpen = activeIndex !== null;

  useEffect(() => {
    activeIndexRef.current = activeIndex;
    photosRef.current = photos;
  }, [activeIndex, photos]);

  useEffect(() => {
    if (!viewerOpen) return;

    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const previousBodyOverflow = document.body.style.overflow;

    function handleKeyDown(event: KeyboardEvent) {
      const currentIndex = activeIndexRef.current;
      if (event.key === 'Escape') {
        event.preventDefault();
        setActiveIndex(null);
        return;
      }
      if (currentIndex === null || photosRef.current.length < 2) return;

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        setActiveIndex((currentIndex - 1 + photosRef.current.length) % photosRef.current.length);
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        setActiveIndex((currentIndex + 1) % photosRef.current.length);
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousBodyOverflow;
      previouslyFocused?.focus();
    };
  }, [viewerOpen]);

  function changePhoto(direction: -1 | 1) {
    setActiveIndex((currentIndex) => {
      if (currentIndex === null || photos.length < 2) return currentIndex;
      return (currentIndex + direction + photos.length) % photos.length;
    });
  }

  function closeViewer() {
    setActiveIndex(null);
  }

  function handleBackdropClick(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) closeViewer();
  }

  if (photos.length === 0) return null;

  const activePhoto = activeIndex === null ? null : photos[activeIndex];

  return (
    <>
      <div
        className="grid grid-cols-2 gap-2 sm:grid-cols-4"
        aria-label="Entry photos"
        role="list"
      >
        {photos.map((photo, index) => (
          <figure
            key={photo.id}
            className="aero-photo-card group relative aspect-square rounded-xl"
            role="listitem"
          >
            <button
              type="button"
              className="aero-photo-thumb relative z-0 block h-full w-full cursor-zoom-in overflow-hidden rounded-xl focus:outline-none focus-visible:ring-4 focus-visible:ring-[#146cc2]/70"
              aria-label={`View photo ${index + 1}`}
              onClick={() => setActiveIndex(index)}
            >
              <Image
                src={`/photos/${photo.id}`}
                alt={`Photo ${index + 1} from this entry`}
                fill
                unoptimized
                sizes="(max-width: 639px) 50vw, 25vw"
                className="object-cover transition duration-200 group-hover:scale-105"
              />
            </button>
            <DeletePhotoButton photoId={photo.id} />
          </figure>
        ))}
      </div>

      {activePhoto && activeIndex !== null ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-[#061b35]/85 p-3 backdrop-blur-sm sm:p-6"
          role="presentation"
          onClick={handleBackdropClick}
        >
          <section
            className="aero-photo-viewer flex max-h-[calc(100vh-1.5rem)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl sm:max-h-[calc(100vh-3rem)]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="photo-viewer-title"
          >
            <header className="aero-photo-viewer-bar flex items-center justify-between border-b border-white/80 px-4 py-3">
              <h2 id="photo-viewer-title" className="text-sm font-bold text-[#0a2f5c]">
                Photo {activeIndex + 1} of {photos.length}
              </h2>
              <button
                ref={closeButtonRef}
                type="button"
                className="aero-photo-viewer-close flex h-10 w-10 items-center justify-center rounded-full text-2xl font-bold leading-none text-white focus:outline-none focus-visible:ring-4 focus-visible:ring-red-300"
                aria-label="Close photo viewer"
                onClick={closeViewer}
              >
                <span aria-hidden="true">×</span>
              </button>
            </header>

            <div className="aero-photo-viewer-stage relative flex min-h-0 items-center justify-center px-2 py-3 sm:px-6 sm:py-5">
              <div className="relative h-[min(70vh,75vw)] min-h-[220px] w-full">
                <Image
                  src={`/photos/${activePhoto.id}`}
                  alt={`Photo ${activeIndex + 1} from this entry, enlarged`}
                  fill
                  unoptimized
                  sizes="(max-width: 639px) 100vw, 80vw"
                  className="object-contain"
                  priority
                />
              </div>
            </div>

            <footer className="aero-photo-viewer-bar flex items-center justify-between border-t border-white/80 px-4 py-3">
              <button
                type="button"
                className="aero-photo-nav rounded-full px-4 py-2 text-sm font-bold text-[#10427a] disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="View previous photo"
                disabled={photos.length < 2}
                onClick={() => changePhoto(-1)}
              >
                ‹ Previous
              </button>
              <button
                type="button"
                className="aero-photo-nav rounded-full px-4 py-2 text-sm font-bold text-[#10427a] disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="View next photo"
                disabled={photos.length < 2}
                onClick={() => changePhoto(1)}
              >
                Next ›
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </>
  );
}
