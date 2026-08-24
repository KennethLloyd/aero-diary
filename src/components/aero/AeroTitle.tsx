import type { ReactNode } from 'react';

// Shared Aero page title with responsive, balanced typography.
export function AeroTitle({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <h1
      className={`text-2xl font-bold tracking-tight text-[#0a2f5c] sm:text-3xl ${className}`}
      style={{ textShadow: '0 1px 3px rgba(255,255,255,0.85)' }}
    >
      {children}
    </h1>
  );
}
