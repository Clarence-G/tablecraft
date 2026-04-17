import type { ClientEvents, ServerEvents } from '@repo/shared';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { Socket } from 'socket.io-client';

type AppSocket = Socket<ServerEvents, ClientEvents>;

interface GameSnapshot {
  state: unknown;
  lastReject: string | null;
  notifications: unknown[];
  matchStartedAt: number | null;
}

// Stable empty snapshot — singleton so Object.is() stays true when nothing changed
const EMPTY_SNAPSHOT: GameSnapshot = {
  state: null,
  lastReject: null,
  notifications: [],
  matchStartedAt: null,
};
const noop = () => {};
const noopUnsub = () => noop;

class GameStore {
  private _snapshot: GameSnapshot = EMPTY_SNAPSHOT;
  private listeners = new Set<() => void>();
  private seq = 0;
  private rejectTimer: ReturnType<typeof setTimeout> | null = null;
  private socket: AppSocket;

  constructor(socket: AppSocket) {
    this.socket = socket;

    socket.on('game:state', (view) => {
      const matchStartedAt = this._snapshot.matchStartedAt ?? Date.now();
      this._snapshot = { ...this._snapshot, state: view, matchStartedAt };
      this.notify();
    });

    socket.on('game:reject', (reason) => {
      this._snapshot = { ...this._snapshot, lastReject: reason };
      this.notify();
      if (this.rejectTimer) clearTimeout(this.rejectTimer);
      this.rejectTimer = setTimeout(() => {
        this._snapshot = { ...this._snapshot, lastReject: null };
        this.notify();
      }, 3000);
    });

    socket.on('game:notify', (payload) => {
      this._snapshot = {
        ...this._snapshot,
        notifications: [...this._snapshot.notifications, payload],
      };
      this.notify();
    });
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): GameSnapshot => this._snapshot;

  sendAction = (action: unknown) => {
    this.socket.emit('game:action', action, ++this.seq);
  };

  destroy() {
    if (this.rejectTimer) clearTimeout(this.rejectTimer);
    this.socket.off('game:state');
    this.socket.off('game:reject');
    this.socket.off('game:notify');
    this._snapshot = EMPTY_SNAPSHOT;
  }

  private notify() {
    for (const l of this.listeners) l();
  }
}

export function useGame(socket: AppSocket | null) {
  const storeRef = useRef<GameStore | null>(null);

  if (socket && !storeRef.current) {
    storeRef.current = new GameStore(socket);
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: storeRef is a stable React ref
  useEffect(() => {
    return () => {
      storeRef.current?.destroy();
      storeRef.current = null;
    };
  }, [socket]);

  const snapshot = useSyncExternalStore(
    storeRef.current?.subscribe ?? noopUnsub,
    storeRef.current?.getSnapshot ?? (() => EMPTY_SNAPSHOT),
  );

  return { ...snapshot, sendAction: storeRef.current?.sendAction ?? noop };
}
