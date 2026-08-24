'use client';

import { useActionState } from 'react';
import { login, loginDemo, type LoginState } from '@/actions/auth';
import { AeroButton } from '@/components/aero/AeroButton';
import { AeroField } from '@/components/aero/AeroField';

export function LoginForm({ demoAvailable }: { demoAvailable: boolean }) {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(
    login,
    undefined,
  );

  return (
    <div className="flex w-full flex-col gap-3">
      <form action={formAction} className="flex w-full flex-col gap-3">
        <AeroField label="Email" htmlFor="login-email">
          <input
            id="login-email"
            type="email"
            name="email"
            className="aero-input w-full"
            placeholder="you@example.com"
            autoComplete="email"
            required
          />
        </AeroField>
        <AeroField label="Password" htmlFor="login-password">
          <input
            id="login-password"
            type="password"
            name="password"
            className="aero-input w-full"
            placeholder="Your password"
            autoComplete="current-password"
            required
          />
        </AeroField>
        {state?.error ? (
          <p
            role="alert"
            className="rounded-md border border-red-300 bg-red-50/80 px-3 py-2 text-center text-sm font-semibold text-red-700"
          >
            {state.error}
          </p>
        ) : null}
        <AeroButton type="submit" tone="primary" size="lg" disabled={pending} className="w-full">
          {pending ? 'Signing in…' : 'Sign in'}
        </AeroButton>
      </form>

      {demoAvailable ? (
        <form action={loginDemo} className="mt-1 w-full">
          <AeroButton tone="secondary" size="lg" type="submit" className="w-full">
            Try the demo
          </AeroButton>
        </form>
      ) : (
        <div className="mt-1 w-full space-y-2">
          <AeroButton tone="secondary" size="lg" type="button" disabled className="w-full">
            Try the demo
          </AeroButton>
          <p className="text-center text-xs font-semibold text-[#5a7194]" role="status">
            Demo unavailable until the server is configured and seeded.
          </p>
        </div>
      )}
    </div>
  );
}
