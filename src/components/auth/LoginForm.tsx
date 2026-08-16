'use client'

import { useActionState } from 'react'
import { login, loginDemo, type LoginState } from '@/app/actions/auth'
import { AeroButton } from '@/components/aero/AeroButton'

// Aero login form (ADR-0009): email/password + "Try the demo". `useActionState`
// wires the action's returned error state into the form.
export function LoginForm() {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(
    login,
    undefined,
  )

  return (
    <>
      <form action={formAction} className="flex w-full flex-col gap-3">
        <input
          type="email"
          name="email"
          className="aero-input w-full"
          placeholder="Email"
          autoComplete="email"
          required
        />
        <input
          type="password"
          name="password"
          className="aero-input w-full"
          placeholder="Password"
          autoComplete="current-password"
          required
        />
        {state?.error ? (
          <p
            role="alert"
            className="rounded-md border border-red-300 bg-red-50/80 px-3 py-2 text-center text-sm font-semibold text-red-700"
          >
            {state.error}
          </p>
        ) : null}
        <AeroButton type="submit" disabled={pending} className="w-full py-3 text-lg">
          {pending ? 'Signing in…' : 'Sign in'}
        </AeroButton>
      </form>

      <form action={loginDemo} className="mt-3 w-full">
        <AeroButton
          variant="white"
          type="submit"
          className="w-full py-3 text-lg"
        >
          Try the demo
        </AeroButton>
      </form>
    </>
  )
}