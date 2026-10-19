'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

export type AeroDockHideReason = 'near-save' | 'photo-viewer';

type AeroDockVisibility = {
  hidden: boolean
  setHidden: (reason: AeroDockHideReason, hidden: boolean) => void
}

const DEFAULT_VISIBILITY: AeroDockVisibility = {
  hidden: false,
  setHidden: () => undefined,
};

const AeroDockVisibilityContext = createContext<AeroDockVisibility>(DEFAULT_VISIBILITY);

export function AeroDockVisibilityProvider({
  children,
  hideDockNearSave = false,
}: {
  children: ReactNode
  hideDockNearSave?: boolean
}) {
  const [hideReasons, setHideReasons] = useState<ReadonlySet<AeroDockHideReason>>(
    () => new Set(),
  );
  const setHidden = useCallback((reason: AeroDockHideReason, hidden: boolean) => {
    if (reason === 'near-save' && !hideDockNearSave) return;

    setHideReasons((current) => {
      if (current.has(reason) === hidden) return current;

      const next = new Set(current);
      if (hidden) next.add(reason);
      else next.delete(reason);
      return next;
    });
  }, [hideDockNearSave]);

  return (
    <AeroDockVisibilityContext.Provider value={{ hidden: hideReasons.size > 0, setHidden }}>
      {children}
    </AeroDockVisibilityContext.Provider>
  );
}

export function useAeroDockVisibility() {
  return useContext(AeroDockVisibilityContext);
}

export function useAeroDockHidden(reason: AeroDockHideReason, hidden: boolean) {
  const { setHidden } = useAeroDockVisibility();

  useEffect(() => {
    setHidden(reason, hidden);
    return () => setHidden(reason, false);
  }, [hidden, reason, setHidden]);
}
