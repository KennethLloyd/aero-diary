import type { ReactNode } from 'react';
import { AeroDock } from '@/components/aero/AeroDock';

export function AeroScreen({
  children,
  hideDockNearSave = false,
}: {
  children: ReactNode
  hideDockNearSave?: boolean
}) {
  return (
    <div className="aero-screen">
      <div className="aero-screen-content">{children}</div>
      <AeroDock key={hideDockNearSave ? 'entry' : 'default'} hideNearSave={hideDockNearSave} />
    </div>
  );
}
