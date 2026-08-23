'use client';

import { RouteError } from '@/components/aero/RouteError';

export default function ActivitiesError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteError title="Activities unavailable" message="Your activity vocabulary could not be loaded. Try again or return to the timeline." reset={reset} />;
}
