'use client';

import { RouteError } from '@/components/aero/RouteError';

export default function SettingsError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteError title="Settings unavailable" message="Your settings could not be loaded. Try again or return to the timeline." reset={reset} />;
}
