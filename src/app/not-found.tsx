import { AeroBubbles } from '@/components/aero/AeroBubbles';
import { RecoveryState } from '@/components/aero/RecoveryState';

export default function NotFound() {
  return (
    <>
      <AeroBubbles />
      <main className="relative z-10 flex min-h-screen items-center justify-center px-4">
        <RecoveryState
          title="Page not found"
          message="That page does not exist or the link may be out of date. Your timeline is still here."
        />
      </main>
    </>
  );
}
