import Link from 'next/link';
import { Suspense } from 'react';
import { logout } from '@/actions/auth';
import { AeroBubbles } from '@/components/aero/AeroBubbles';
import { AeroScreen } from '@/components/aero/AeroScreen';
import { AeroTitle } from '@/components/aero/AeroTitle';
import { verifySession } from '@/lib/dal';
import { getActivitiesForUser } from '@/lib/journal/queries';

export default function SettingsPage() {
  return (
    <>
      <AeroBubbles />
      <AeroScreen>
        <main className="aero-page relative z-10 mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-4 sm:py-6 md:pt-8">
          <header className="px-1">
            <AeroTitle>Settings</AeroTitle>
            <p className="mt-0.5 text-xs font-semibold text-[#2b4c73] drop-shadow-2xs">
              Preferences and management for your journal.
            </p>
          </header>
          <Suspense fallback={<div className="aero-surface-plain h-28 animate-pulse" aria-label="Loading settings" />}>
            <SettingsContent />
          </Suspense>
        </main>
      </AeroScreen>
    </>
  );
}

async function SettingsContent() {
  const session = await verifySession();
  const activities = await getActivitiesForUser(session.userId);

  return (
    <div className="flex flex-col gap-4">
      <section className="aero-surface-plain p-2" aria-labelledby="settings-management-heading">
        <h2 id="settings-management-heading" className="sr-only">Management</h2>
        <Link
          href="/activities"
          className="flex items-center gap-3 rounded-xl p-3 transition hover:bg-sky-50/80"
        >
          <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl border border-white/80 bg-white/80 text-lg shadow-xs" aria-hidden="true">
            🏷️
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="text-sm font-bold text-[#0a2f5c]">Activities</span>
              <span className="rounded-full bg-sky-100/90 px-2 py-0.5 text-[11px] font-bold text-[#14538f]">
                {activities.length}
              </span>
            </span>
            <span className="mt-0.5 block text-xs font-medium text-[#2b4c73]">
              Manage the tags that describe your memories.
            </span>
          </span>
          <span className="text-base font-bold text-[#146cc2]" aria-hidden="true">›</span>
        </Link>
      </section>

      <section className="aero-surface-plain flex flex-col gap-3 p-4" aria-labelledby="settings-account-heading">
        <h2 id="settings-account-heading" className="text-xs font-bold uppercase tracking-wider text-[#0a2f5c]">
          Account
        </h2>
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-medium text-[#2b4c73]">
            Signing out ends this session on this device.
          </p>
          <form action={logout}>
            <button
              type="submit"
              className="aero-icon-btn h-9 min-h-9 w-auto gap-1.5 whitespace-nowrap rounded-full px-3.5 text-xs font-bold"
            >
              Sign out
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}
