import type { ReactNode } from 'react';
import { AeroDock } from '@/components/aero/AeroDock';
import { AeroDockVisibilityProvider } from '@/components/aero/AeroDockVisibility';

export function AeroScreen({
  children,
  hideDockNearSave = false,
}: {
  children: ReactNode
  hideDockNearSave?: boolean
}) {
  return (
    <AeroDockVisibilityProvider hideDockNearSave={hideDockNearSave}>
      <div className="aero-screen">
        <div className="aero-screen-content">{children}</div>
        <AeroDock />
      </div>
    </AeroDockVisibilityProvider>
  );
}
