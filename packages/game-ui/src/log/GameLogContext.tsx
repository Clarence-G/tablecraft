import { type ReactNode, createContext, useCallback, useMemo, useRef, useState } from 'react';
import type { PlayerInfo } from '@repo/shared';
import type { LogEntry, PushLogEntry } from './types';

const MAX_ENTRIES = 200;

export interface GameLogContextValue {
  entries: LogEntry[];
  push: (entry: PushLogEntry) => void;
  ingestNotifications: (notifications: unknown[]) => void;
  clear: () => void;
  /**
   * Map of playerId → display name, so log rows can render actor nicknames
   * instead of raw bot/user IDs. Populated by the game page via
   * <GameLogProvider playerNames={...}>. Empty object when no mapping is
   * available — consumers should fall back to `actorId` in that case.
   */
  playerNames: Record<string, string>;
  /** Full player list, used for per-player color lookup in LogRow. */
  players?: readonly PlayerInfo[];
}

export const GameLogContext = createContext<GameLogContextValue | null>(null);

function nextId(seq: { current: number }): string {
  seq.current += 1;
  return `log-${seq.current}`;
}

/**
 * Qualify a bare i18n key (e.g. `log.drop`) with the game's namespace so
 * i18next resolves it under the right resource bundle. Keys that already
 * include a namespace separator (`:`) — like `gomoku.log.move` handed in
 * from Board.tsx or an explicitly namespaced `connect-four:log.drop` — are
 * passed through unchanged.
 *
 * This is the fix for the historical bug where every game's server-side
 * `logAction('log.drop', ...)` rendered as raw `log.drop` in the activity
 * log, because SidePanel's `t(key)` used the default `common` namespace.
 */
function qualifyMessageKey(key: string, ns: string | undefined): string {
  if (!ns) return key;
  if (key.includes(':')) return key; // already namespaced
  if (key.startsWith(`${ns}.`)) return `${ns}:${key.slice(ns.length + 1)}`;
  return `${ns}:${key}`;
}

export function GameLogProvider({
  children,
  defaultNs,
  playerNames,
  players,
}: {
  children: ReactNode;
  defaultNs?: string;
  playerNames?: Record<string, string>;
  players?: readonly PlayerInfo[];
}) {
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

  const ingestNotifications = useCallback(
    (notifications: unknown[]) => {
      if (!Array.isArray(notifications) || notifications.length === 0) return;
      const fresh: PushLogEntry[] = [];
      for (const n of notifications) {
        // Only ingest entries on the 'log' sub-channel. Game-specific UI
        // payloads (e.g. private card reveals) flow through the same
        // `notifications` array but are consumed by the Board component.
        if (n === null || typeof n !== 'object') continue;
        const record = n as Record<string, unknown>;
        if (record.channel !== 'log') continue;
        if (typeof record.messageKey !== 'string') continue;

        // Dedupe by object identity so repeated re-renders of the same
        // notifications array don't double-append.
        if (seenNotifications.current.has(n as object)) continue;
        seenNotifications.current.add(n as object);

        const kindRaw = typeof record.kind === 'string' ? record.kind : 'system';
        const kind: PushLogEntry['kind'] =
          kindRaw === 'action' || kindRaw === 'info' ? kindRaw : 'system';
        const messageParams =
          record.messageParams && typeof record.messageParams === 'object'
            ? (record.messageParams as Record<string, string | number>)
            : undefined;
        const actorId = typeof record.actorId === 'string' ? record.actorId : undefined;
        fresh.push({
          kind,
          actorId,
          messageKey: qualifyMessageKey(record.messageKey, defaultNs),
          messageParams,
        });
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
    },
    [defaultNs],
  );

  const clear = useCallback(() => setEntries([]), []);

  const value = useMemo<GameLogContextValue>(
    () => ({ entries, push, ingestNotifications, clear, playerNames: playerNames ?? {}, players }),
    [entries, push, ingestNotifications, clear, playerNames, players],
  );

  return <GameLogContext.Provider value={value}>{children}</GameLogContext.Provider>;
}
