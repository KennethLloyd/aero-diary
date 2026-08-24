import { Suspense } from 'react';
import Link from 'next/link';
import { AeroBubbles } from '@/components/aero/AeroBubbles';
import { AeroCard } from '@/components/aero/AeroCard';
import { AeroPageHeader } from '@/components/aero/AeroPageHeader';
import { AeroScreen } from '@/components/aero/AeroScreen';
import { SignOutButton } from '@/components/aero/SignOutButton';
import { verifySession } from '@/lib/dal';

export default function SettingsPage() {
  return (
    <>
      <AeroBubbles />
      <AeroScreen>
        <main className="aero-page relative z-10 mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 md:pt-10">
          <Suspense fallback={<SettingsLoading />}>
            <SettingsContent />
          </Suspense>
        </main>
      </AeroScreen>
    </>
  );
}

async function SettingsContent() {
  await verifySession();

  return (
    <>
      <AeroPageHeader
        title="Settings"
        subtitle="Manage your journal preferences"
        size="md"
      />

      <AeroCard tier="card" padded>
        <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-[#5a7194]">
          Manage
        </h2>
        <ul className="divide-y divide-white/60">
          <li>
            <Link
              href="/settings/activities"
              className="flex items-center justify-between gap-3 rounded-lg px-2 py-3 transition hover:bg-white/40"
            >
              <span className="flex min-w-0 items-center gap-3">
                <span className="text-2xl" aria-hidden="true">🏷️</span>
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-[#0a2f5c]">Activities</span>
                  <span className="block truncate text-xs font-semibold text-[#5a7194]">
                    Tags that make your memories searchable
                  </span>
                </span>
              </span>
              <span className="text-[#5a7194]" aria-hidden="true">›</span>
            </Link>
          </li>
        </ul>
      </AeroCard>

      <AeroCard tier="card" padded>
        <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-[#5a7194]">
          Account
        </h2>
        <SignOutButton />
      </AeroCard>
    </>
  );
}

function SettingsLoading() {
  return (
    <>
      <div className="aero-surface-card h-12 animate-pulse" />
      <div className="aero-surface-card h-32 animate-pulse" />
      <div className="aero-surface-card h-20 animate-pulse" />
    </>
  );
}
