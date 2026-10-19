import type { ReactNode } from 'react';
import { Suspense } from 'react';
import { AeroDock } from '@/components/aero/AeroDock';
import { AeroDockVisibilityProvider } from '@/components/aero/AeroDockVisibility';
import { AppLockMonitor } from '@/components/auth/AppLockMonitor';
import { verifySession } from '@/lib/dal';

export function AeroScreen({
  children,
  hideDockNearSave = false,
  showDock = true,
}: {
  children: ReactNode;
  hideDockNearSave?: boolean;
  showDock?: boolean;
}) {
  return (
    <AeroDockVisibilityProvider hideDockNearSave={hideDockNearSave}>
      <div className="aero-screen">
        <div className="aero-screen-content">{children}</div>
        {showDock ? <AeroDock /> : null}
        <Suspense fallback={null}>
          <AeroShellControls />
        </Suspense>
      </div>
    </AeroDockVisibilityProvider>
  );
}

async function AeroShellControls() {
  const session = await verifySession();

  return session.appLockEnabled ? (
    <AppLockMonitor timeoutMinutes={session.appLockTimeoutMinutes} />
  ) : null;
}
