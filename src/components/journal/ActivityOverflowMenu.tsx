'use client';

import { useEffect, useRef, useState } from 'react';

type MenuItem = {
  label: string
  onClick: () => void
  danger?: boolean
}

export function ActivityOverflowMenu({ items, label = 'Activity options' }: { items: MenuItem[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const firstItemRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    firstItemRef.current?.focus();
    function handleClick(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        className="flex h-9 w-9 items-center justify-center rounded-full border border-white/70 bg-white/40 text-lg font-bold text-[#2b4c73] shadow-sm transition hover:bg-white/70"
      >
        <span aria-hidden="true">...</span>
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-1 min-w-[10rem] overflow-hidden rounded-xl border border-white/90 bg-white/95 shadow-[0_8px_20px_rgba(0,36,91,0.25)] backdrop-blur-md"
        >
          {items.map((item, index) => (
            <button
              key={item.label}
              ref={index === 0 ? firstItemRef : undefined}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
              className={`flex w-full items-center px-3 py-2 text-left text-sm font-bold transition hover:bg-white/60 ${
                item.danger ? 'text-[#c21414]' : 'text-[#0a2f5c]'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
