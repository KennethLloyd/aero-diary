import type { ReactNode } from 'react';

// Shared Aero page title.
export function AeroTitle({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <h1
      className={`text-4xl font-bold tracking-tight text-[#0a2f5c] ${className}`}
      style={{ textShadow: '0 2px 4px rgba(255,255,255,0.8)' }}
    >
      {children}
    </h1>
  );
}
