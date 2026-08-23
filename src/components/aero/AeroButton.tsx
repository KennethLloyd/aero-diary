import Link from 'next/link';
import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  ReactNode,
} from 'react';

type Variant = 'blue' | 'white' | 'red'

const VARIANT_CLASSES: Record<Variant, string> = {
  blue: 'aero-btn',
  white: 'aero-btn aero-btn-white',
  red: 'aero-btn aero-btn-red',
};

type AeroButtonProps = {
  variant?: Variant
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
  href,
  className = '',
  children,
  ...rest
}: AeroButtonProps) {
  const classes = `${VARIANT_CLASSES[variant]} ${className}`;

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
