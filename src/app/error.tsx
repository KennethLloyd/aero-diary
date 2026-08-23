'use client';

import { AeroBubbles } from '@/components/aero/AeroBubbles';
import { RecoveryState } from '@/components/aero/RecoveryState';

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <>
      <AeroBubbles />
      <main className="relative z-10 flex min-h-screen items-center justify-center px-4">
        <RecoveryState
          title="Aero Diary needs a refresh"
          message="This page could not load your memories. Try again, or return to the timeline."
          actionHref="/timeline"
          actionLabel="Return to timeline"
          secondaryHref="/"
          secondaryLabel="Go to login"
          onRetry={reset}
        />
      </main>
    </>
  );
}
