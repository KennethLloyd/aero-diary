import { redirect } from 'next/navigation';
import { AeroBubbles } from '@/components/aero/AeroBubbles';
import { AeroLogo } from '@/components/aero/AeroLogo';
import { AeroTitle } from '@/components/aero/AeroTitle';
import { AppLockForm } from '@/components/auth/AppLockForm';
import {
  isAppLockLocked,
  verifyAuthenticatedSession,
} from '@/lib/dal';

export default async function UnlockPage() {
  const session = await verifyAuthenticatedSession();
  if (!isAppLockLocked(session)) redirect('/timeline');

  return (
    <>
      <AeroBubbles />
      <main className="aero-safe-area-main relative z-10 flex min-h-screen flex-col items-center justify-center p-4">
        <div className="aero-hero flex w-full max-w-sm flex-col items-center p-6 sm:p-8">
          <AeroLogo />
          <AeroTitle className="mb-1 mt-4 text-center">Aero Diary is locked</AeroTitle>
          <p className="mb-6 text-center text-xs font-semibold text-[#2b4c73]">
            Enter your PIN to continue this session.
          </p>
          <AppLockForm />
        </div>
      </main>
    </>
  );
}
