import { AeroBubbles } from '@/components/aero/AeroBubbles'
import { AeroLogo } from '@/components/aero/AeroLogo'
import { AeroTitle } from '@/components/aero/AeroTitle'
import { LoginForm } from '@/components/auth/LoginForm'

// Login screen (ADR-0009: the prototype's Google button becomes the aero
// email/password form + "Try the demo"). Auth wiring lands in ticket #2.
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

          <LoginForm />
        </div>
      </main>
    </>
  )
}