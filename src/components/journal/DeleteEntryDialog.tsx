'use client'

import { useActionState, useState } from 'react'
import { deleteEntry, type DeleteEntryState } from '@/actions/entries'
import { AeroButton } from '@/components/aero/AeroButton'

export function DeleteEntryDialog({ entryId }: { entryId: string }) {
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState<DeleteEntryState, FormData>(
    deleteEntry.bind(null, entryId),
    undefined,
  )

  return (
    <>
      <button
        type="button"
        className="text-sm font-bold text-red-700 drop-shadow-md hover:text-red-900"
        onClick={() => setOpen(true)}
      >
        Delete
      </button>

      {open ? (
        <div className="aero-modal-backdrop" role="presentation">
          <section
            className="aero-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-entry-title"
            aria-describedby="delete-entry-description"
          >
            <header className="aero-modal-titlebar">
              <span>Confirm Deletion</span>
              <button
                type="button"
                className="aero-modal-close"
                aria-label="Close delete confirmation"
                onClick={() => setOpen(false)}
                disabled={pending}
              >
                X
              </button>
            </header>

            <div className="aero-modal-body">
              <div className="mt-1 text-4xl text-red-600 drop-shadow-md" aria-hidden="true">
                ⚠️
              </div>
              <div>
                <h2 id="delete-entry-title" className="mb-1 text-lg font-bold text-[#0a2f5c]">
                  Delete this entry?
                </h2>
                <p id="delete-entry-description" className="text-sm leading-snug text-[#111]">
                  Are you sure you want to permanently remove this memory? This action cannot be undone.
                </p>
                {state?.error ? (
                  <p role="alert" className="mt-3 text-sm font-semibold text-red-700">
                    {state.error}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="aero-modal-actions">
              <button
                type="button"
                className="aero-modal-cancel"
                onClick={() => setOpen(false)}
                disabled={pending}
              >
                Cancel
              </button>
              <form action={formAction}>
                <AeroButton variant="red" type="submit" disabled={pending} className="px-4 py-1.5 text-sm">
                  {pending ? 'Deleting…' : 'Delete'}
                </AeroButton>
              </form>
            </div>
          </section>
        </div>
      ) : null}
    </>
  )
}
