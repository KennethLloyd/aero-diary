'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

type AeroDockProps = {
  hideNearSave?: boolean
}

// Bottom navigation for the journal screens with icons + labels.
const DOCK_ITEMS = [
  { href: '/timeline', label: 'Timeline', icon: '📖', match: (path: string) => path === '/timeline' || path.startsWith('/timeline/') },
  { href: '/calendar', label: 'Calendar', icon: '📅', match: (path: string) => path === '/calendar' },
  { href: '/insights', label: 'Insights', icon: '📊', match: (path: string) => path === '/insights' },
  // Activities management lives under Settings, so it keeps Settings lit.
  { href: '/settings', label: 'Settings', icon: '⚙️', match: (path: string) => path === '/settings' || path.startsWith('/activities') },
];

export function AeroDock({ hideNearSave = false }: AeroDockProps) {
  const pathname = usePathname();

  return (
    <nav
      className="aero-dock"
      data-hide-near-save={hideNearSave || undefined}
      aria-label="Main navigation"
    >
      {DOCK_ITEMS.map((item) => {
        const isActive = item.match(pathname);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-label={item.label}
            aria-current={isActive ? 'page' : undefined}
            className={`dock-item ${isActive ? 'active' : ''}`}
          >
            <span className="dock-icon-wrap" aria-hidden="true">
              {item.icon}
            </span>
            <span className="dock-label">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
