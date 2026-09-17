'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  lockAppForIdle,
  refreshAppLockActivity,
} from '@/actions/app-lock';

const SERVER_REFRESH_INTERVAL_MS = 30_000;
const CLIENT_ACTIVITY_THROTTLE_MS = 1_000;

export function AppLockMonitor({ timeoutMinutes }: { timeoutMinutes: number }) {
  const router = useRouter();
  const [locking, setLocking] = useState(false);

  const lock = useCallback(async () => {
    setLocking(true);
    try {
      await lockAppForIdle();
    } finally {
      router.replace('/unlock');
      router.refresh();
    }
  }, [router]);

  useEffect(() => {
    if (timeoutMinutes === 0) {
      const handleVisibility = () => {
        if (document.hidden) void lock();
      };
      document.addEventListener('visibilitychange', handleVisibility);
      return () => document.removeEventListener('visibilitychange', handleVisibility);
    }

    const timeoutMs = timeoutMinutes * 60 * 1000;
    let idleTimer = window.setTimeout(() => void lock(), timeoutMs);
    let lastActivityAt = Date.now();
    let activitySinceRefresh = true;
    let stopped = false;

    const resetIdleTimer = () => {
      window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(() => void lock(), timeoutMs);
    };

    const handleActivity = () => {
      const now = Date.now();
      if (now - lastActivityAt < CLIENT_ACTIVITY_THROTTLE_MS) return;
      lastActivityAt = now;
      activitySinceRefresh = true;
      resetIdleTimer();
    };

    const syncActivity = async () => {
      if (!activitySinceRefresh || stopped) return;
      activitySinceRefresh = false;
      try {
        await refreshAppLockActivity();
      } catch {
        if (!stopped) void lock();
      }
    };

    const handleVisibility = () => {
      if (!document.hidden) {
        handleActivity();
        void syncActivity();
      }
    };

    const events: Array<keyof WindowEventMap> = [
      'pointerdown',
      'pointermove',
      'keydown',
      'touchstart',
    ];
    for (const event of events) {
      window.addEventListener(event, handleActivity, { passive: true });
    }
    document.addEventListener('visibilitychange', handleVisibility);
    void syncActivity();
    const refreshInterval = window.setInterval(
      () => void syncActivity(),
      SERVER_REFRESH_INTERVAL_MS,
    );

    return () => {
      stopped = true;
      window.clearTimeout(idleTimer);
      window.clearInterval(refreshInterval);
      for (const event of events) {
        window.removeEventListener(event, handleActivity);
      }
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [lock, timeoutMinutes]);

  if (!locking) return null;
  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-white/95 text-sm font-bold text-[#0a2f5c]" role="status">
      Locking Aero Diary…
    </div>
  );
}
