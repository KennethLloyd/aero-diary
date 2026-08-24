import type { ButtonHTMLAttributes } from 'react';

type ChipTone = 'neutral' | 'selected' | 'subtle'
type ChipSize = 'sm' | 'md'
type AeroChipProps = {
  tone?: ChipTone
  size?: ChipSize
  className?: string
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'>

const TONE_CLASSES: Record<ChipTone, string> = {
  neutral: 'aero-chip-neutral',
  selected: 'aero-chip-selected',
  subtle: 'aero-chip-subtle',
};

const SIZE_CLASSES: Record<ChipSize, string> = {
  sm: 'aero-chip-sm',
  md: 'aero-chip-md',
};

export function AeroChip({
  tone = 'neutral',
  size = 'md',
  className = '',
  children,
  ...rest
}: AeroChipProps) {
  return (
    <button
      type="button"
      className={`aero-chip ${TONE_CLASSES[tone]} ${SIZE_CLASSES[size]} ${className}`}
      aria-pressed={tone === 'selected'}
      {...rest}
    >
      {children}
    </button>
  );
}
