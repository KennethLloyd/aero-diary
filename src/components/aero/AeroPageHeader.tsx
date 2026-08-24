import type { ReactNode } from 'react';

type AeroPageHeaderProps = {
  title: ReactNode
  subtitle?: ReactNode
  trailing?: ReactNode
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const TITLE_CLASSES: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'text-xl',
  md: 'text-2xl',
  lg: 'text-3xl',
};

export function AeroPageHeader({
  title,
  subtitle,
  trailing,
  size = 'md',
  className = '',
}: AeroPageHeaderProps) {
  return (
    <header className={`flex items-center justify-between gap-3 pb-4 ${className}`}>
      <div className="min-w-0">
        <h1 className={`font-bold tracking-tight text-[#0a2f5c] ${TITLE_CLASSES[size]}`}>
          {title}
        </h1>
        {subtitle && (
          <p className="mt-0.5 text-sm font-semibold text-[#2b4c73]">
            {subtitle}
          </p>
        )}
      </div>
      {trailing && (
        <div className="flex shrink-0 items-center gap-2">
          {trailing}
        </div>
      )}
    </header>
  );
}
