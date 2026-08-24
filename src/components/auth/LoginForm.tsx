'use client';

import { useActionState } from 'react';
import { login, loginDemo, type LoginState } from '@/actions/auth';
import { AeroButton } from '@/components/aero/AeroButton';

// Aero login form with email/password and an optional configured demo.
// `useActionState` wires the action's returned error state into the form.
export function LoginForm({ demoAvailable }: { demoAvailable: boolean }) {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(
    login,
    undefined,
  );

  return (
    <>
      <form action={formAction} className="flex w-full flex-col gap-3">
        <div>
          <label htmlFor="login-email" className="mb-1 block text-xs font-bold uppercase tracking-wider text-[#0a2f5c]">
            Email
          </label>
          <input
            id="login-email"
            type="email"
            name="email"
            className="aero-input w-full text-sm"
            placeholder="you@example.com"
            autoComplete="email"
            required
          />
        </div>
        <div>
          <label htmlFor="login-password" className="mb-1 block text-xs font-bold uppercase tracking-wider text-[#0a2f5c]">
            Password
          </label>
          <input
            id="login-password"
            type="password"
            name="password"
            className="aero-input w-full text-sm"
            placeholder="Your password"
            autoComplete="current-password"
            required
          />
        </div>
        {state?.error ? (
          <p
            role="alert"
            className="rounded-lg border border-red-300 bg-red-50/95 px-3 py-2 text-center text-xs font-semibold text-red-700 shadow-xs"
          >
            {state.error}
          </p>
        ) : null}
        <AeroButton type="submit" disabled={pending} className="mt-1 w-full py-2.5 text-base shadow-md">
          {pending ? 'Signing in…' : 'Sign in'}
        </AeroButton>
      </form>

      {demoAvailable ? (
        <form action={loginDemo} className="mt-2.5 w-full">
          <AeroButton
            variant="white"
            type="submit"
            className="w-full py-2 text-sm font-bold"
          >
            Try the demo
          </AeroButton>
        </form>
      ) : (
        <div className="mt-2.5 w-full space-y-1.5">
          <AeroButton
            variant="white"
            type="button"
            disabled
            className="w-full py-2 text-sm font-bold"
          >
            Try the demo
          </AeroButton>
          <p className="text-center text-[11px] font-semibold text-[#2b4c73]" role="status">
            Demo unavailable until configured and seeded.
          </p>
        </div>
      )}
    </>
  );
}
