import { AeroBubbles } from '@/components/aero/AeroBubbles'
import { AeroButton } from '@/components/aero/AeroButton'
import { AeroLogo } from '@/components/aero/AeroLogo'
import { AeroTitle } from '@/components/aero/AeroTitle'

// Login shell (ADR-0009: the prototype's Google button becomes the aero
// email/password form + "Try the demo"). Auth wiring lands in ticket #2 —
// this page is the styled scaffold shell.
export default function LoginPage() {
  return (
    <>
      <AeroBubbles />
      <main className="relative z-10 flex min-h-screen flex-col items-center justify-center px-4">
        <div className="aero-glass flex w-full max-w-sm flex-col items-center p-8">
          <AeroLogo />

          <AeroTitle className="mb-2 mt-6">Aero Diary</AeroTitle>
          <p className="mb-8 text-center text-sm font-semibold text-[#2b4c73]">
            Your memories, vividly preserved.
          </p>

          <form className="flex w-full flex-col gap-3">
            <input
              type="email"
              className="aero-input w-full"
              placeholder="Email"
              autoComplete="email"
            />
            <input
              type="password"
              className="aero-input w-full"
              placeholder="Password"
              autoComplete="current-password"
            />
            <AeroButton type="submit" className="w-full py-3 text-lg">
              Sign in
            </AeroButton>
          </form>

          <AeroButton
            variant="white"
            href="/timeline"
            className="mt-3 w-full py-3 text-lg"
          >
            Try the demo
          </AeroButton>
        </div>
      </main>
    </>
  )
}