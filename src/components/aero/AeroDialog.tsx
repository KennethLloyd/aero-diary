'use client';

import { useEffect, useRef, type ReactNode, type RefObject } from 'react';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function AeroDialog({
  open,
  title,
  description,
  titleId,
  onClose,
  initialFocusRef,
  children,
}: {
  open: boolean
  title: string
  description?: string
  titleId: string
  onClose: () => void
  initialFocusRef?: RefObject<HTMLElement | null>
  children: ReactNode
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const previousOverflow = document.body.style.overflow;
    const dialog = dialogRef.current;
    const firstFocusTarget = initialFocusRef?.current
      ?? dialog?.querySelector<HTMLElement>(FOCUSABLE)
      ?? dialog;

    document.body.style.overflow = 'hidden';
    firstFocusTarget?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !dialog) return;

      const focusable = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [initialFocusRef, open]);

  if (!open) return null;

  return (
    <div
      className="aero-modal-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={dialogRef}
        className="aero-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? `${titleId}-description` : undefined}
        tabIndex={-1}
      >
        <header className="aero-modal-titlebar">
          <span id={titleId}>{title}</span>
          <button
            type="button"
            className="aero-modal-close"
            aria-label={`Close ${title.toLocaleLowerCase()}`}
            onClick={onClose}
          >
            X
          </button>
        </header>
        <div className="aero-modal-body">
          <div className="mt-1 text-4xl text-red-600 drop-shadow-md" aria-hidden="true">⚠️</div>
          <div>
            {description ? <p id={`${titleId}-description`} className="text-sm leading-snug text-[#111]">{description}</p> : null}
            {children}
          </div>
        </div>
      </section>
    </div>
  );
}
