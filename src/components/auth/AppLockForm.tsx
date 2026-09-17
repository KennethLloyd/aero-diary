'use client';

import { useActionState } from 'react';
import { unlockApp, type AppLockState } from '@/actions/app-lock';
import { AeroButton } from '@/components/aero/AeroButton';

export function AppLockForm() {
  const [state, formAction, pending] = useActionState<AppLockState, FormData>(
    unlockApp,
    undefined,
  );

  return (
    <form action={formAction} className="flex w-full flex-col gap-3">
      <div>
        <label htmlFor="unlock-pin" className="mb-1 block text-xs font-bold uppercase tracking-wider text-[#0a2f5c]">
          PIN
        </label>
        <input
          id="unlock-pin"
          name="pin"
          type="password"
          inputMode="numeric"
          pattern="[0-9]{4}|[0-9]{6}"
          minLength={4}
          maxLength={6}
          autoComplete="off"
          autoFocus
          required
          className="aero-input w-full text-center text-xl tracking-[0.35em]"
          aria-describedby={state?.error ? 'unlock-error' : undefined}
        />
      </div>
      {state?.error ? (
        <p id="unlock-error" role="alert" className="rounded-lg border border-red-300 bg-red-50/95 px-3 py-2 text-center text-xs font-semibold text-red-700 shadow-xs">
          {state.error}
        </p>
      ) : null}
      <AeroButton type="submit" disabled={pending} className="w-full">
        {pending ? 'Unlocking…' : 'Unlock'}
      </AeroButton>
    </form>
  );
}
