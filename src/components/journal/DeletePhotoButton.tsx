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
      className="absolute right-2 top-2 z-20"
    >
      <button
        type="submit"
        className="aero-photo-delete flex h-11 w-11 items-center justify-center rounded-full text-2xl font-bold leading-none text-white focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
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
