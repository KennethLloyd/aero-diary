import Link from 'next/link';
import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  ReactNode,
} from 'react';

type Variant = 'blue' | 'white' | 'red'
type Size = 'sm' | 'md' | 'lg'
type Tone = 'primary' | 'secondary' | 'ghost' | 'danger'

const VARIANT_CLASSES: Record<Variant, string> = {
  blue: 'aero-btn',
  white: 'aero-btn aero-btn-white',
  red: 'aero-btn aero-btn-red',
};

const TONE_CLASSES: Record<Tone, string> = {
  primary: 'aero-btn-base aero-btn-primary',
  secondary: 'aero-btn-base aero-btn-secondary',
  ghost: 'aero-btn-base aero-btn-ghost',
  danger: 'aero-btn-base aero-btn-danger',
};

const SIZE_CLASSES: Record<Size, string> = {
  sm: 'aero-btn-sm',
  md: 'aero-btn-md',
  lg: 'aero-btn-lg',
};

type AeroButtonProps = {
  variant?: Variant
  size?: Size
  tone?: Tone
  href?: string
  className?: string
  children: ReactNode
} & (
  | ButtonHTMLAttributes<HTMLButtonElement>
  | AnchorHTMLAttributes<HTMLAnchorElement>
)

// Glossy split-highlight button. Renders a <button>, or a
// <Link> when `href` is provided. The union type keeps both element
// attribute sets valid; the casts narrow the union at each branch.
export function AeroButton({
  variant = 'blue',
  size = 'md',
  tone,
  href,
  className = '',
  children,
  ...rest
}: AeroButtonProps) {
  const classes = tone
    ? `${TONE_CLASSES[tone]} ${SIZE_CLASSES[size]} ${className}`
    : `${VARIANT_CLASSES[variant]} ${className}`;

  if (href) {
    return (
      <Link
        href={href}
        className={classes}
        {...(rest as AnchorHTMLAttributes<HTMLAnchorElement>)}
      >
        {children}
      </Link>
    );
  }

  return (
    <button
      className={classes}
      {...(rest as ButtonHTMLAttributes<HTMLButtonElement>)}
    >
      {children}
    </button>
  );
}
