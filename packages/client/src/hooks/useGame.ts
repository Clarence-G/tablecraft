import type { ClientEvents, ServerEvents } from '@repo/shared';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { Socket } from 'socket.io-client';

type AppSocket = Socket<ServerEvents, ClientEvents>;

interface GameOverPayload {
  rankings: string[];
  ties?: string[][];
  pointsDelta: Record<string, number>;
}

interface GameSnapshot {
  /** Authoritative state from the last `game:state` broadcast. */
  authoritativeState: unknown;
  /** Optional client-side optimistic overlay. Cleared on `game:state`, `game:reject`, or send-timeout. */
  optimisticView: unknown;
  lastReject: string | null;
  notifications: unknown[];
  matchStartedAt: number | null;
  isSending: boolean;
  /** Latest `game:over` payload for the just-finished match; null until the match ends. */
  gameOver: GameOverPayload | null;
}

// 3s保底超时:服务端丢包/挂了时也要放行下一次点击
const SEND_TIMEOUT_MS = 3000;

const EMPTY_SNAPSHOT: GameSnapshot = {
  authoritativeState: null,
  optimisticView: null,
  lastReject: null,
  notifications: [],
  matchStartedAt: null,
  isSending: false,
  gameOver: null,
};
const noop = () => {};
const noopUnsub = () => noop;

// Exported for unit tests — the React hook is a thin wrapper over this store.
export class GameStore {
  private _snapshot: GameSnapshot = EMPTY_SNAPSHOT;
  private listeners = new Set<() => void>();
  private seq = 0;
  private rejectTimer: ReturnType<typeof setTimeout> | null = null;
  private sendTimer: ReturnType<typeof setTimeout> | null = null;
  private socket: AppSocket;

  constructor(socket: AppSocket) {
    this.socket = socket;

    socket.on('game:state', (view) => {
      const matchStartedAt = this._snapshot.matchStartedAt ?? Date.now();
      this.clearSendTimer();
      this._snapshot = {
        ...this._snapshot,
        authoritativeState: view,
        optimisticView: null,
        matchStartedAt,
        isSending: false,
      };
      this.notify();
    });

    socket.on('game:reject', (reason) => {
      this.clearSendTimer();
      this._snapshot = {
        ...this._snapshot,
        lastReject: reason,
        optimisticView: null,
        isSending: false,
      };
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

    socket.on('game:over', (payload) => {
      this._snapshot = {
        ...this._snapshot,
        gameOver: payload,
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

  sendAction = (action: unknown, optimisticView?: unknown) => {
    if (this._snapshot.isSending) return;
    this._snapshot = {
      ...this._snapshot,
      isSending: true,
      optimisticView: optimisticView !== undefined ? optimisticView : this._snapshot.optimisticView,
    };
    this.notify();
    this.socket.emit('game:action', action, ++this.seq);
    this.sendTimer = setTimeout(() => {
      this.sendTimer = null;
      if (!this._snapshot.isSending) return;
      this._snapshot = { ...this._snapshot, isSending: false, optimisticView: null };
      this.notify();
    }, SEND_TIMEOUT_MS);
  };

  destroy() {
    if (this.rejectTimer) clearTimeout(this.rejectTimer);
    this.clearSendTimer();
    this.socket.off('game:state');
    this.socket.off('game:reject');
    this.socket.off('game:notify');
    this.socket.off('game:over');
    this._snapshot = EMPTY_SNAPSHOT;
  }

  resetForRoom = () => {
    if (this.rejectTimer) {
      clearTimeout(this.rejectTimer);
      this.rejectTimer = null;
    }
    this.clearSendTimer();
    this._snapshot = {
      authoritativeState: null,
      optimisticView: null,
      lastReject: null,
      notifications: [],
      matchStartedAt: null,
      isSending: false,
      gameOver: null,
    };
    this.notify();
  };

  private clearSendTimer() {
    if (this.sendTimer) {
      clearTimeout(this.sendTimer);
      this.sendTimer = null;
    }
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

  const view = snapshot.optimisticView ?? snapshot.authoritativeState;

  return {
    view,
    authoritativeState: snapshot.authoritativeState,
    lastReject: snapshot.lastReject,
    notifications: snapshot.notifications,
    matchStartedAt: snapshot.matchStartedAt,
    isSending: snapshot.isSending,
    gameOver: snapshot.gameOver,
    sendAction: storeRef.current?.sendAction ?? noop,
    resetForRoom: storeRef.current?.resetForRoom ?? noop,
  };
}
