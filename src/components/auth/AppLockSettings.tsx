'use client';

import { useActionState } from 'react';
import {
  changeAppLockPin,
  disableAppLock,
  enableAppLock,
  updateAppLockTimeout,
  type AppLockState,
} from '@/actions/app-lock';
import { AeroButton } from '@/components/aero/AeroButton';

const TIMEOUT_OPTIONS = [
  { value: 0, label: 'Immediately' },
  { value: 1, label: '1 minute' },
  { value: 5, label: '5 minutes' },
  { value: 15, label: '15 minutes' },
] as const;

function PinInput({ id, label }: { id: string; label: string }) {
  return (
    <input
      id={id}
      name="pin"
      type="password"
      inputMode="numeric"
      pattern="[0-9]{4}|[0-9]{6}"
      minLength={4}
      maxLength={6}
      autoComplete="new-password"
      placeholder="4 or 6 digits"
      aria-label={label}
      required
      className="aero-input min-w-0 flex-1 text-sm"
    />
  );
}

function TimeoutSelect({ defaultValue }: { defaultValue: number }) {
  return (
    <select
      key={defaultValue}
      name="timeoutMinutes"
      defaultValue={defaultValue}
      className="aero-input min-w-0 flex-1 text-sm"
      aria-label="Lock after"
    >
      {TIMEOUT_OPTIONS.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function FormMessage({ state }: { state: AppLockState }) {
  if (!state?.error && !state?.success) return null;
  return (
    <p
      role={state.error ? 'alert' : 'status'}
      className={`text-xs font-semibold ${state.error ? 'text-red-700' : 'text-emerald-700'}`}
    >
      {state.error ?? state.success}
    </p>
  );
}

export function AppLockSettings({
  enabled,
  timeoutMinutes,
}: {
  enabled: boolean
  timeoutMinutes: number
}) {
  const [enableState, enableAction, enablePending] = useActionState<AppLockState, FormData>(
    enableAppLock,
    undefined,
  );
  const [pinState, pinAction, pinPending] = useActionState<AppLockState, FormData>(
    changeAppLockPin,
    undefined,
  );
  const [timeoutState, timeoutAction, timeoutPending] = useActionState<AppLockState, FormData>(
    updateAppLockTimeout,
    undefined,
  );

  if (!enabled) {
    return (
      <form action={enableAction} className="flex flex-col gap-3">
        <p className="text-xs font-medium text-[#2b4c73]">
          Require a PIN before showing diary content while this account stays signed in.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <PinInput id="enable-app-lock-pin" label="Set App Lock PIN" />
          <TimeoutSelect defaultValue={timeoutMinutes} />
          <AeroButton type="submit" disabled={enablePending} className="shrink-0 text-sm">
            {enablePending ? 'Enabling…' : 'Enable'}
          </AeroButton>
        </div>
        <FormMessage state={enableState} />
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs font-semibold text-emerald-700" role="status">
        App Lock is enabled for this account.
      </p>

      <form action={pinAction} className="flex flex-col gap-2">
        <label htmlFor="change-app-lock-pin" className="text-xs font-bold text-[#0a2f5c]">
          Change PIN
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <PinInput id="change-app-lock-pin" label="Change PIN" />
          <AeroButton type="submit" disabled={pinPending} className="shrink-0 text-sm">
            {pinPending ? 'Saving…' : 'Change PIN'}
          </AeroButton>
        </div>
        <FormMessage state={pinState} />
      </form>

      <form action={timeoutAction} className="flex flex-col gap-2">
        <label className="text-xs font-bold text-[#0a2f5c]">Lock after</label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <TimeoutSelect defaultValue={timeoutMinutes} />
          <AeroButton type="submit" disabled={timeoutPending} className="shrink-0 text-sm">
            {timeoutPending ? 'Saving…' : 'Save timeout'}
          </AeroButton>
        </div>
        <FormMessage state={timeoutState} />
      </form>

      <div className="flex items-center justify-between gap-3 border-t border-sky-100 pt-3">
        <p className="text-xs font-medium text-[#2b4c73]">
          Disabling removes the PIN without signing out.
        </p>
        <form action={disableAppLock}>
          <button type="submit" className="aero-icon-btn h-9 min-h-9 w-auto shrink-0 rounded-full px-3.5 text-xs font-bold">
            Disable
          </button>
        </form>
      </div>
    </div>
  );
}
