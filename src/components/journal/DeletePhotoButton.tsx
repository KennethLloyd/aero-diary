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
      className="mt-2 text-center"
    >
      <button
        type="submit"
        className="text-xs font-bold text-red-700 hover:text-red-900"
        disabled={pending}
      >
        {pending ? 'Removing…' : 'Remove photo'}
      </button>
      {state?.error ? <p role="alert" className="mt-1 text-xs font-semibold text-red-700">{state.error}</p> : null}
    </form>
  );
}
