import type { ReactNode } from 'react';
import { AeroDock } from '@/components/aero/AeroDock';

export function AeroScreen({ children }: { children: ReactNode }) {
  return (
    <div className="aero-screen">
      <div className="aero-screen-content">{children}</div>
      <AeroDock />
    </div>
  );
}
