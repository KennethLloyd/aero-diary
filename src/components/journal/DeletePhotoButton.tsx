'use client';

import { useActionState } from 'react';
import { deletePhoto, type DeletePhotoState } from '@/actions/entries';

export function DeletePhotoButton({ photoId }: { photoId: string }) {
  const [state, formAction, pending] = useActionState<DeletePhotoState, FormData>(
    deletePhoto.bind(null, photoId),
    undefined,
  );

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (!window.confirm('Remove this photo permanently?')) event.preventDefault();
      }}
      className="absolute right-1.5 top-1.5 z-20"
    >
      <button
        type="submit"
        className="flex h-8 w-8 items-center justify-center rounded-full border border-white/85 bg-gradient-to-b from-[#ff8b8b] to-[#c93a3a] text-sm font-bold leading-none text-white shadow-[0_2px_4px_rgba(120,20,20,0.35),inset_0_1px_0_rgba(255,255,255,0.55)] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
        aria-label="Remove photo"
        title="Remove photo"
        disabled={pending}
      >
        <span aria-hidden="true">×</span>
      </button>
      {state?.error ? (
        <p role="alert" className="absolute right-0 top-full mt-1 w-max max-w-48 rounded-md bg-red-50 px-2 py-1 text-xs font-semibold text-red-700 shadow-md">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
