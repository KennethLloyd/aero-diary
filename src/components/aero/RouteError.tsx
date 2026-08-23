'use client';

import { RecoveryState } from '@/components/aero/RecoveryState';

export function RouteError({ title, message, reset }: { title: string; message: string; reset: () => void }) {
  return (
    <main className="relative z-10 flex min-h-screen items-center justify-center px-4">
      <RecoveryState
        title={title}
        message={message}
        actionHref="/timeline"
        actionLabel="Return to timeline"
        secondaryHref="/"
        secondaryLabel="Go to login"
        onRetry={reset}
      />
    </main>
  );
}
