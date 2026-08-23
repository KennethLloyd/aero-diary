'use client';

import './globals.css';
import { RecoveryState } from '@/components/aero/RecoveryState';

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body className="bg-[#9bd0f5]">
        <main className="flex min-h-screen items-center justify-center px-4">
          <RecoveryState
            title="Aero Diary needs a restart"
            message="Something unexpected interrupted the journal. Try again or return to login."
            actionHref="/"
            actionLabel="Return to login"
            secondaryHref="/"
            secondaryLabel="Refresh"
            onRetry={reset}
          />
        </main>
      </body>
    </html>
  );
}
