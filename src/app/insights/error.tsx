'use client';

import { RouteError } from '@/components/aero/RouteError';

export default function InsightsError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteError title="Insights unavailable" message="Your journal trends could not be calculated. Try again or return to the timeline." reset={reset} />;
}
