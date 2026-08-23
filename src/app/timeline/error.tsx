'use client';

import { RouteError } from '@/components/aero/RouteError';

export default function TimelineError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteError title="Timeline unavailable" message="Your recent memories could not be loaded. Try again or return to the timeline later." reset={reset} />;
}
