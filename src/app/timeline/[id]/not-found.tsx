import { AeroBubbles } from '@/components/aero/AeroBubbles';
import { RecoveryState } from '@/components/aero/RecoveryState';

export default function EntryNotFound() {
  return (
    <>
      <AeroBubbles />
      <main className="relative z-10 flex min-h-screen items-center justify-center px-4">
        <RecoveryState
          title="Memory not found"
          message="This memory is no longer available in your private journal. Return to the timeline to continue browsing."
        />
      </main>
    </>
  );
}
