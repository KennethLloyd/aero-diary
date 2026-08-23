'use client';

import { RouteError } from '@/components/aero/RouteError';

export default function CalendarError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteError title="Calendar unavailable" message="The calendar could not load this month. Try again or browse your timeline instead." reset={reset} />;
}
