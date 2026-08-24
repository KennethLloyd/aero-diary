'use client';

import Link from 'next/link';
import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  ReactNode,
} from 'react';

type IconButtonTone = 'primary' | 'secondary' | 'ghost' | 'danger'
type IconButtonSize = 'sm' | 'md' | 'lg'
type AeroIconButtonProps = {
  tone?: IconButtonTone
  size?: IconButtonSize
  label: string
  href?: string
  className?: string
  children: ReactNode
} & (
  | ButtonHTMLAttributes<HTMLButtonElement>
  | AnchorHTMLAttributes<HTMLAnchorElement>
)

const TONE_CLASSES: Record<IconButtonTone, string> = {
  primary: 'aero-icon-btn-primary',
  secondary: 'aero-icon-btn-secondary',
  ghost: 'aero-icon-btn-ghost',
  danger: 'aero-icon-btn-danger',
};

const SIZE_CLASSES: Record<IconButtonSize, string> = {
  sm: 'aero-icon-btn-sm',
  md: 'aero-icon-btn-md',
  lg: 'aero-icon-btn-lg',
};

export function AeroIconButton({
  tone = 'secondary',
  size = 'md',
  label,
  href,
  className = '',
  children,
  ...rest
}: AeroIconButtonProps) {
  const classes = `aero-icon-btn ${TONE_CLASSES[tone]} ${SIZE_CLASSES[size]} ${className}`;

  if (href) {
    return (
      <Link
        href={href}
        className={classes}
        aria-label={label}
        {...(rest as AnchorHTMLAttributes<HTMLAnchorElement>)}
      >
        {children}
      </Link>
    );
  }

  return (
    <button
      type="button"
      className={classes}
      aria-label={label}
      {...(rest as ButtonHTMLAttributes<HTMLButtonElement>)}
    >
      {children}
    </button>
  );
}
