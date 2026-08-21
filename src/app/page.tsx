import { AeroBubbles } from '@/components/aero/AeroBubbles';
import { AeroLogo } from '@/components/aero/AeroLogo';
import { AeroTitle } from '@/components/aero/AeroTitle';
import { LoginForm } from '@/components/auth/LoginForm';
import { isDemoConfigured } from '@/lib/auth/server-demo-config';

// Login screen (ADR-0009): email/password plus the optional configured demo.
export default function LoginPage() {
  const demoAvailable = isDemoConfigured();

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

          <LoginForm demoAvailable={demoAvailable} />
        </div>
      </main>
    </>
  );
}
