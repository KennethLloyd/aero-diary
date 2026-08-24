import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { AeroBubbles } from '@/components/aero/AeroBubbles';
import { AeroCard } from '@/components/aero/AeroCard';
import { AeroLogo } from '@/components/aero/AeroLogo';
import { AeroTitle } from '@/components/aero/AeroTitle';
import { LoginForm } from '@/components/auth/LoginForm';
import { isDemoConfigured } from '@/lib/auth/server-demo-config';
import { getOptionalSession } from '@/lib/dal';

export default function LoginPage() {
  return (
    <>
      <AeroBubbles />
      <Suspense fallback={<LoginLoading />}>
        <LoginContent />
      </Suspense>
    </>
  );
}

async function LoginContent() {
  const session = await getOptionalSession();
  if (session) redirect('/timeline');

  return (
    <main className="relative z-10 flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <AeroCard tier="hero" padded className="flex w-full max-w-sm flex-col items-center !p-8">
        <AeroLogo />
        <AeroTitle size="lg" className="mt-6 mb-2">Aero Diary</AeroTitle>
        <p className="mb-8 text-center text-base font-semibold text-[#2b4c73]">
          Your memories, vividly preserved.
        </p>
        <LoginForm demoAvailable={isDemoConfigured()} />
      </AeroCard>
    </main>
  );
}

function LoginLoading() {
  return (
    <main className="relative z-10 flex min-h-screen flex-col items-center justify-center px-4" aria-label="Loading Aero Diary">
      <div className="aero-surface-hero h-96 w-full max-w-sm animate-pulse" />
    </main>
  );
}
