'use client';

import { useRef, useState } from 'react';
import { PhotoGallery, type PhotoGalleryPhoto } from '@/components/journal/PhotoGallery';

export function ManageablePhotoGallery({ photos }: { photos: PhotoGalleryPhoto[] }) {
  const [editing, setEditing] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);

  function handleToggle() {
    setEditing((value) => {
      const next = !value;
      if (!next) {
        requestAnimationFrame(() => toggleRef.current?.focus());
      }
      return next;
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-bold uppercase tracking-wide text-[#5a7194]">
          Photos
          {editing ? (
            <span className="ml-2 normal-case tracking-normal text-[#c93a3a]">
              - Tap x to remove
            </span>
          ) : null}
        </h2>
        <button
          ref={toggleRef}
          type="button"
          onClick={handleToggle}
          aria-pressed={editing}
          className={`aero-link-control text-sm font-bold ${
            editing
              ? 'bg-[#e8d9d9] text-[#7a1010]'
              : 'text-[#144e9d]'
          } hover:underline`}
        >
          {editing ? 'Done' : 'Manage'}
        </button>
      </div>
      <PhotoGallery photos={photos} editable={editing} />
    </div>
  );
}
