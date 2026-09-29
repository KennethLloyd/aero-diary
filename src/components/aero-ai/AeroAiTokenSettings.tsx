'use client';

import { useState, useTransition } from 'react';
import { generateAeroAiToken, revokeAeroAiToken, type AeroAiTokenResult } from '@/actions/aero-ai-token';
import { AeroButton } from '@/components/aero/AeroButton';

export function AeroAiTokenSettings({ hasToken }: { hasToken: boolean }) {
  const [active, setActive] = useState(hasToken);
  const [token, setToken] = useState<string | null>(null);
  const [message, setMessage] = useState<AeroAiTokenResult | null>(null);
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<AeroAiTokenResult>) {
    setToken(null);
    setMessage(null);
    startTransition(async () => {
      const result = await action();
      if (result.hasToken !== undefined) setActive(result.hasToken);
      setMessage(result);
      setToken(result.token ?? null);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs font-medium text-[#2b4c73]">
        API tokens can use Aero AI while the browser is locked. Keep yours private and revoke it here.
      </p>
      <p className="text-xs font-semibold text-[#0a2f5c]" role="status">
        {active ? 'An API token is active.' : 'No API token is active.'}
      </p>
      {token ? (
        <div className="aero-surface-plain flex flex-col gap-2 p-3" aria-label="New Aero AI API token">
          <code className="select-all break-all text-xs text-[#0a2f5c]">{token}</code>
          <p className="text-xs font-semibold text-[#2b4c73]">Copy it now; it will not be shown again.</p>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <AeroButton type="button" disabled={pending} onClick={() => run(generateAeroAiToken)} className="text-sm">
          {pending ? 'Saving…' : active ? 'Replace token' : 'Generate token'}
        </AeroButton>
        {active ? (
          <AeroButton type="button" disabled={pending} onClick={() => run(revokeAeroAiToken)} className="text-sm">
            {pending ? 'Saving…' : 'Revoke token'}
          </AeroButton>
        ) : null}
      </div>
      {message?.error ? <p role="alert" className="text-xs font-semibold text-red-700">{message.error}</p> : null}
      {message?.success ? <p role="status" className="text-xs font-semibold text-emerald-700">{message.success}</p> : null}
    </div>
  );
}
