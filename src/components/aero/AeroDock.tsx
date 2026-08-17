'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

// Bottom Aero dock (ADR-0009). Calendar and insights remain future screens;
// the timeline and activity routes are live.
const DOCK_ITEMS = [
  { href: '/timeline', icon: '🗓️', tooltip: 'Timeline' },
  { href: '/calendar', icon: '📆', tooltip: 'Calendar' },
  { href: '/insights', icon: '📊', tooltip: 'Insights' },
  { href: '/activities', icon: '⚙️', tooltip: 'Activities' },
]

export function AeroDock() {
  const pathname = usePathname()

  return (
    <nav className="aero-dock" aria-label="Main navigation">
      {DOCK_ITEMS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          data-tooltip={item.tooltip}
          className={`dock-icon ${pathname === item.href ? 'active' : ''}`}
        >
          {item.icon}
        </Link>
      ))}
    </nav>
  )
}
