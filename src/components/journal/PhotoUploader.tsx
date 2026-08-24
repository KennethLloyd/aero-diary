'use client';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';

type PhotoPreview = { id: string; url: string; name: string };

type PhotoUploaderProps = {
  name?: string;
  accept?: string;
  multiple?: boolean;
  maxCount?: number;
};

export function PhotoUploader({
  name = 'photo',
  accept = 'image/jpeg,image/png,image/heic,image/heif,.heic,.heif',
  multiple = true,
  maxCount = 10,
}: PhotoUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previews, setPreviews] = useState<PhotoPreview[]>([]);
  const previewsRef = useRef(previews);

  useEffect(() => {
    previewsRef.current = previews;
  }, [previews]);

  // Revoke object URLs on unmount to avoid memory leaks
  useEffect(() => {
    return () => {
      previewsRef.current.forEach((p) => URL.revokeObjectURL(p.url));
    };
  }, []);

  function handleFiles(fileList: FileList | null) {
    if (!fileList) return;
    const newFiles = Array.from(fileList);
    const next: PhotoPreview[] = newFiles.map((file) => ({
      id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
      url: URL.createObjectURL(file),
      name: file.name,
    }));
    setPreviews((current) => [...current, ...next].slice(0, maxCount));
  }

  function removePreview(id: string) {
    setPreviews((current) => {
      const target = current.find((p) => p.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return current.filter((p) => p.id !== id);
    });
  }

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        name={name}
        accept={accept}
        multiple={multiple}
        className="sr-only"
        onChange={(event) => handleFiles(event.target.files)}
        tabIndex={-1}
        aria-hidden="true"
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/70 bg-white/40 px-4 py-3 text-sm font-bold text-[#0a2f5c] shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_1px_2px_rgba(0,0,0,0.05)] transition hover:bg-white/60"
      >
        <span className="text-lg" aria-hidden="true">📷</span>
        <span>Add photos</span>
      </button>
      <p className="text-xs font-semibold text-[#5a7194]">
        JPEG, PNG, or HEIC · up to {maxCount} photos · 10 MB each
      </p>
      {previews.length > 0 ? (
        <ul
          className="grid grid-cols-4 gap-2 sm:grid-cols-5"
          aria-label="Selected photo previews"
        >
          {previews.map((preview) => (
            <li
              key={preview.id}
              className="relative aspect-square overflow-hidden rounded-lg border border-white bg-white/40"
            >
              <Image
                src={preview.url}
                alt={preview.name}
                fill
                unoptimized
                sizes="(max-width: 639px) 25vw, 15vw"
                className="object-cover"
              />
              <button
                type="button"
                onClick={() => removePreview(preview.id)}
                className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full border border-white/80 bg-gradient-to-b from-[#ff7777] to-[#b91c1c] text-xs font-bold text-white shadow-[0_2px_4px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.6)] hover:brightness-110"
                aria-label={`Remove ${preview.name}`}
              >
                <span aria-hidden="true">×</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
