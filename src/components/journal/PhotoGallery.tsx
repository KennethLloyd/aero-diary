'use client';

import Image from 'next/image';
import { useEffect, useRef, useState, type MouseEvent, type RefObject } from 'react';
import { DeletePhotoButton } from '@/components/journal/DeletePhotoButton';

export type PhotoGalleryPhoto = {
  id: string
}

const FOCUSABLE = 'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

function PhotoMedia({
  photo,
  alt,
  sizes,
  className,
  priority = false,
  containerClassName = '',
  retryable = true,
}: {
  photo: PhotoGalleryPhoto
  alt: string
  sizes: string
  className: string
  priority?: boolean
  containerClassName?: string
  retryable?: boolean
}) {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [retryCount, setRetryCount] = useState(0);

  return (
    <div className={`relative h-full w-full ${containerClassName}`}>
      {status === 'loading' ? (
        <div className="photo-media-loading absolute inset-0 flex items-center justify-center text-xs font-semibold text-[#2b4c73]" role="status">
          Loading photo…
        </div>
      ) : null}
      {status === 'error' ? (
        <div className="photo-media-fallback absolute inset-0 flex-col gap-2 p-4" role="status">
          <span className="text-2xl" aria-hidden="true">🖼️</span>
          <span className="text-sm font-bold">Photo unavailable</span>
          {retryable ? (
            <button
              type="button"
              className="aero-link-control text-xs font-bold text-[#144e9d] underline"
              onClick={() => {
                setStatus('loading');
                setRetryCount((count) => count + 1);
              }}
            >
              Try again
            </button>
          ) : <span className="text-xs font-semibold">Open to retry</span>}
        </div>
      ) : null}
      <Image
        src={`/photos/${photo.id}?retry=${retryCount}`}
        alt={alt}
        fill
        unoptimized
        sizes={sizes}
        priority={priority}
        className={`${className} ${status === 'error' ? 'invisible' : ''}`}
        onLoad={() => setStatus('loaded')}
        onError={() => setStatus('error')}
      />
    </div>
  );
}

function usePhotoViewerFocus(
  viewerOpen: boolean,
  dialogRef: RefObject<HTMLElement | null>,
  close: () => void,
  activeIndexRef: RefObject<number | null>,
  photosRef: RefObject<PhotoGalleryPhoto[]>,
  setActiveIndex: (update: number | ((current: number | null) => number | null)) => void,
) {
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  }, [close]);

  useEffect(() => {
    if (!viewerOpen) return;

    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const previousBodyOverflow = document.body.style.overflow;
    const dialog = dialogRef.current;
    document.body.style.overflow = 'hidden';
    dialog?.querySelector<HTMLElement>(FOCUSABLE)?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      const currentIndex = activeIndexRef.current;
      if (event.key === 'Escape') {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key === 'Tab' && dialog) {
        const focusable = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)];
        const first = focusable[0];
        const last = focusable.at(-1);
        if (first && last) {
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }
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
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousBodyOverflow;
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [activeIndexRef, dialogRef, photosRef, setActiveIndex, viewerOpen]);
}

export function PhotoGallery({
  photos,
  editable = false,
}: {
  photos: PhotoGalleryPhoto[]
  editable?: boolean
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const activeIndexRef = useRef(activeIndex);
  const photosRef = useRef(photos);
  const viewerOpen = activeIndex !== null;

  useEffect(() => {
    activeIndexRef.current = activeIndex;
    photosRef.current = photos;
  }, [activeIndex, photos]);

  function closeViewer() {
    setActiveIndex(null);
  }

  usePhotoViewerFocus(viewerOpen, dialogRef, closeViewer, activeIndexRef, photosRef, setActiveIndex);

  function changePhoto(direction: -1 | 1) {
    setActiveIndex((currentIndex) => {
      if (currentIndex === null || photos.length < 2) return currentIndex;
      return (currentIndex + direction + photos.length) % photos.length;
    });
  }

  function handleBackdropClick(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) closeViewer();
  }

  if (photos.length === 0) return null;

  const activePhoto = activeIndex === null ? null : photos[activeIndex];

  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Entry photos" role="list">
        {photos.map((photo, index) => (
          <figure key={photo.id} className="aero-photo-card group relative aspect-square rounded-xl" role="listitem">
            <button
              type="button"
              className="aero-photo-thumb relative z-0 block h-full w-full cursor-zoom-in overflow-hidden rounded-xl focus:outline-none"
              aria-label={`View photo ${index + 1}`}
              onClick={() => setActiveIndex(index)}
            >
              <PhotoMedia
                photo={photo}
                alt={`Photo ${index + 1} from this entry`}
                sizes="(max-width: 639px) 50vw, 25vw"
                className="object-cover transition duration-200 group-hover:scale-105"
                retryable={false}
              />
            </button>
            {editable ? <DeletePhotoButton photoId={photo.id} /> : null}
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
            ref={dialogRef}
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
                type="button"
                className="aero-photo-viewer-close flex h-11 w-11 items-center justify-center rounded-full text-2xl font-bold leading-none text-white focus:outline-none"
                aria-label="Close photo viewer"
                onClick={closeViewer}
              >
                <span aria-hidden="true">×</span>
              </button>
            </header>

            <div className="aero-photo-viewer-stage relative flex min-h-0 items-center justify-center px-2 py-3 sm:px-6 sm:py-5">
              <div className="relative h-[min(70vh,75vw)] min-h-[220px] w-full">
                <PhotoMedia
                  photo={activePhoto}
                  alt={`Photo ${activeIndex + 1} from this entry, enlarged`}
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
