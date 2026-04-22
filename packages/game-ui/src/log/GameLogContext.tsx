import { type ReactNode, createContext, useCallback, useMemo, useRef, useState } from 'react';
import type { LogEntry, PushLogEntry } from './types';

const MAX_ENTRIES = 200;

export interface GameLogContextValue {
  entries: LogEntry[];
  push: (entry: PushLogEntry) => void;
  ingestNotifications: (notifications: unknown[]) => void;
  clear: () => void;
}

export const GameLogContext = createContext<GameLogContextValue | null>(null);

function nextId(seq: { current: number }): string {
  seq.current += 1;
  return `log-${seq.current}`;
}

export function GameLogProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const seqRef = useRef({ current: 0 });
  const seenNotifications = useRef<WeakSet<object>>(new WeakSet());

  const push = useCallback((entry: PushLogEntry) => {
    setEntries((prev) => {
      const next: LogEntry = {
        id: nextId(seqRef.current),
        at: Date.now(),
        ...entry,
      };
      const merged = prev.length >= MAX_ENTRIES ? prev.slice(prev.length - MAX_ENTRIES + 1) : prev;
      return [...merged, next];
    });
  }, []);

  const ingestNotifications = useCallback((notifications: unknown[]) => {
    if (!Array.isArray(notifications) || notifications.length === 0) return;
    const fresh: PushLogEntry[] = [];
    for (const n of notifications) {
      if (n !== null && typeof n === 'object') {
        if (seenNotifications.current.has(n as object)) continue;
        seenNotifications.current.add(n as object);
      }
      const record = (n ?? {}) as Record<string, unknown>;
      const messageKey =
        typeof record.messageKey === 'string'
          ? record.messageKey
          : typeof record.type === 'string'
            ? `notification.${record.type}`
            : 'notification.generic';
      const messageParams =
        record.messageParams && typeof record.messageParams === 'object'
          ? (record.messageParams as Record<string, string | number>)
          : undefined;
      const actorId = typeof record.actorId === 'string' ? record.actorId : undefined;
      fresh.push({ kind: 'system', actorId, messageKey, messageParams });
    }
    if (fresh.length === 0) return;
    setEntries((prev) => {
      const appended = [...prev];
      for (const entry of fresh) {
        appended.push({ id: nextId(seqRef.current), at: Date.now(), ...entry });
      }
      const overflow = appended.length - MAX_ENTRIES;
      return overflow > 0 ? appended.slice(overflow) : appended;
    });
  }, []);

  const clear = useCallback(() => setEntries([]), []);

  const value = useMemo<GameLogContextValue>(
    () => ({ entries, push, ingestNotifications, clear }),
    [entries, push, ingestNotifications, clear],
  );

  return <GameLogContext.Provider value={value}>{children}</GameLogContext.Provider>;
}
