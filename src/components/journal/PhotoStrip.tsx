'use client';

import { useRef, useState, type PointerEvent, type ReactNode } from 'react';

type DragState = {
  pointerId: number
  startX: number
  startScrollLeft: number
}

function isInteractiveTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest('button, a, input, textarea, select'));
}

export function PhotoStrip({ children }: { children: ReactNode }) {
  const dragRef = useRef<DragState | null>(null);
  const [dragging, setDragging] = useState(false);

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || isInteractiveTarget(event.target)) return;

    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startScrollLeft: event.currentTarget.scrollLeft,
    };
    setDragging(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    event.preventDefault();
    event.currentTarget.scrollLeft = drag.startScrollLeft - (event.clientX - drag.startX);
  }

  function endDrag(event: PointerEvent<HTMLDivElement>) {
    if (!dragRef.current || dragRef.current.pointerId !== event.pointerId) return;

    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
    setDragging(false);
  }

  return (
    <div
      className={`aero-photo-strip no-scrollbar ${dragging ? 'is-dragging' : ''}`}
      aria-label="Polaroid photo strip"
      data-dragging={dragging}
      onPointerCancel={endDrag}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      role="region"
      tabIndex={0}
    >
      {children}
    </div>
  );
}
