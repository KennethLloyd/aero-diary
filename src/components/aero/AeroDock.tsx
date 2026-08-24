'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

type DockItem = {
  href: string;
  icon: ReactNode;
  label: string;
  matchPrefix?: string;
};

const DOCK_ITEMS: DockItem[] = [
  { href: '/timeline', icon: '🏠', label: 'Today', matchPrefix: '/timeline' },
  { href: '/calendar', icon: '📅', label: 'Calendar' },
  { href: '/insights', icon: '📊', label: 'Insights' },
  { href: '/settings', icon: '⚙️', label: 'Settings', matchPrefix: '/settings' },
];

export function AeroDock() {
  const pathname = usePathname();

  function isActive(item: DockItem) {
    if (item.matchPrefix) {
      return pathname === item.href || pathname.startsWith(`${item.href}/`);
    }
    return pathname === item.href;
  }

  return (
    <nav className="aero-dock" aria-label="Main navigation">
      {DOCK_ITEMS.map((item) => {
        const active = isActive(item);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`dock-tab${active ? ' dock-tab-active' : ''}`}
            aria-current={active ? 'page' : undefined}
          >
            <span className="dock-tab-icon" aria-hidden="true">{item.icon}</span>
            <span className="dock-tab-label">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
