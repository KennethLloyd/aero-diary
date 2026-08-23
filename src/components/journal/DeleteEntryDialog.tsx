'use client';

import { useActionState, useRef, useState } from 'react';
import { deleteEntry, type DeleteEntryState } from '@/actions/entries';
import { AeroButton } from '@/components/aero/AeroButton';
import { AeroDialog } from '@/components/aero/AeroDialog';

export function DeleteEntryDialog({ entryId }: { entryId: string }) {
  const [open, setOpen] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [state, formAction, pending] = useActionState<DeleteEntryState, FormData>(
    deleteEntry.bind(null, entryId),
    undefined,
  );

  return (
    <>
      <button
        type="button"
        className="aero-link-control font-bold text-red-700 drop-shadow-md hover:text-red-900"
        onClick={() => setOpen(true)}
      >
        Delete
      </button>

      <AeroDialog
        open={open}
        title="Confirm deletion"
        titleId="delete-entry-title"
        description="Are you sure you want to permanently remove this memory? This action cannot be undone."
        onClose={() => {
          if (!pending) setOpen(false);
        }}
        initialFocusRef={cancelRef}
      >
        {state?.error ? (
          <p role="alert" className="mt-3 text-sm font-semibold text-red-700">{state.error}</p>
        ) : null}
        <div className="aero-modal-actions -mx-1 mt-4 -mb-1">
          <button
            ref={cancelRef}
            type="button"
            className="aero-modal-cancel"
            onClick={() => setOpen(false)}
            disabled={pending}
          >
            Cancel
          </button>
          <form action={formAction}>
            <AeroButton variant="red" type="submit" disabled={pending} className="px-4 text-sm">
              {pending ? 'Deleting…' : 'Delete'}
            </AeroButton>
          </form>
        </div>
      </AeroDialog>
    </>
  );
}
