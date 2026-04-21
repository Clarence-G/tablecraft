import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react';

export interface HeaderStatus {
  currentPlayerId?: string;
  phase?: string;
}

interface Ctx {
  status: HeaderStatus;
  setStatus: (s: HeaderStatus) => void;
}

const GameHeaderCtx = createContext<Ctx | null>(null);

export function GameHeaderProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<HeaderStatus>({});
  const value = useMemo(() => ({ status, setStatus }), [status]);
  return <GameHeaderCtx.Provider value={value}>{children}</GameHeaderCtx.Provider>;
}

export function useHeaderStatus(): HeaderStatus {
  return useContext(GameHeaderCtx)?.status ?? {};
}

/** Called from inside a Board to keep the header's turn/phase info in sync. */
export function useGameHeaderStatus(currentPlayerId?: string, phase?: string): void {
  // `setStatus` from useState is referentially stable, so depending only on it
  // (not the whole context value, which re-memoizes on every status change)
  // prevents an infinite render loop.
  const setStatus = useContext(GameHeaderCtx)?.setStatus;
  useEffect(() => {
    setStatus?.({ currentPlayerId, phase });
  }, [setStatus, currentPlayerId, phase]);
}
