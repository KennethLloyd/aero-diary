import type { ReactNode } from 'react';
import type { ElementType } from 'react';

type CardTier = 'hero' | 'card' | 'plain'
type AeroCardProps = {
  tier?: CardTier
  as?: 'div' | 'section' | 'article' | 'aside' | 'li'
  padded?: boolean
  className?: string
  children: ReactNode
}

export function AeroCard({
  tier = 'card',
  as,
  padded = true,
  className = '',
  children,
}: AeroCardProps) {
  // Hero tier wraps content in a z-stacked div so the ::before highlight sits behind text.
  const Tag = (as ?? 'div') as ElementType;
  const surfaceClass = `aero-surface-${tier} ${padded ? 'p-5' : ''} ${className}`.trim();

  if (tier === 'hero') {
    return (
      <Tag className={surfaceClass}>
        <div className="relative z-10">{children}</div>
      </Tag>
    );
  }

  return (
    <Tag className={surfaceClass}>
      {children}
    </Tag>
  );
}
