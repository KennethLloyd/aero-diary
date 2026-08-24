import type { ReactNode } from 'react';

type TitleSize = 'sm' | 'md' | 'lg'

const SIZE_CLASSES: Record<TitleSize, string> = {
  sm: 'text-2xl',
  md: 'text-3xl',
  lg: 'text-4xl',
};

// Shared Aero page title.
export function AeroTitle({
  children,
  size = 'md',
  className = '',
}: {
  children: ReactNode
  size?: TitleSize
  className?: string
}) {
  return (
    <h1
      className={`${SIZE_CLASSES[size]} font-bold tracking-tight text-[#0a2f5c] aero-title-shadow ${className}`}
    >
      {children}
    </h1>
  );
}
