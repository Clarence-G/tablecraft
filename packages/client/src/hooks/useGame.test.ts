// @vitest-environment node
//
// Tests for the GameStore state machine that backs `useGame`. We drive the
// store directly instead of rendering React because (a) the React hook is a
// pure pass-through over the store snapshot and (b) the client project's
// jsdom environment is currently broken in this repo — testing the store
// directly keeps the coverage and sidesteps the env.

import type { Socket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameStore } from './useGame';

interface FakeSocket {
  listeners: Record<string, (...args: unknown[]) => void>;
  emitted: Array<{ event: string; args: unknown[] }>;
  on: (event: string, cb: (...args: unknown[]) => void) => FakeSocket;
  off: (event: string) => FakeSocket;
  emit: (event: string, ...args: unknown[]) => FakeSocket;
}

function makeSocket(): FakeSocket {
  const listeners: Record<string, (...args: unknown[]) => void> = {};
  const emitted: Array<{ event: string; args: unknown[] }> = [];
  const sock: FakeSocket = {
    listeners,
    emitted,
    on(event, cb) {
      listeners[event] = cb;
      return sock;
    },
    off(event) {
      delete listeners[event];
      return sock;
    },
    emit(event, ...args) {
      emitted.push({ event, args });
      return sock;
    },
  };
  return sock;
}

function asSocket(s: FakeSocket): Socket {
  return s as unknown as Socket;
}

// The hook returns `view = optimisticView ?? authoritativeState`. The tests
// below assert against the store snapshot and compute `view` the same way.
function effectiveView(store: GameStore) {
  const snap = store.getSnapshot();
  return snap.optimisticView ?? snap.authoritativeState;
}

describe('GameStore optimistic view', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sendAction without optimisticView: no overlay, isSending flips, view follows authoritative', () => {
    const sock = makeSocket();
    const store = new GameStore(asSocket(sock));

    expect(store.getSnapshot().isSending).toBe(false);
    expect(effectiveView(store)).toBeNull();

    store.sendAction({ type: 'noop' });
    expect(store.getSnapshot().isSending).toBe(true);
    expect(store.getSnapshot().optimisticView).toBeNull();
    expect(effectiveView(store)).toBeNull();
    expect(sock.emitted[0]?.event).toBe('game:action');

    sock.listeners['game:state']?.({ turn: 1 });
    expect(store.getSnapshot().isSending).toBe(false);
    expect(store.getSnapshot().authoritativeState).toEqual({ turn: 1 });
    expect(effectiveView(store)).toEqual({ turn: 1 });
  });

  it('sendAction with optimisticView: view returns optimistic immediately', () => {
    const sock = makeSocket();
    const store = new GameStore(asSocket(sock));

    sock.listeners['game:state']?.({ turn: 1, shots: [0, 0, 0] });
    expect(effectiveView(store)).toEqual({ turn: 1, shots: [0, 0, 0] });

    const optimistic = { turn: 2, shots: [2, 0, 0] };
    store.sendAction({ type: 'fire' }, optimistic);
    expect(store.getSnapshot().isSending).toBe(true);
    expect(effectiveView(store)).toEqual(optimistic);
    expect(store.getSnapshot().authoritativeState).toEqual({ turn: 1, shots: [0, 0, 0] });
  });

  it('game:state arrival clears the optimistic overlay', () => {
    const sock = makeSocket();
    const store = new GameStore(asSocket(sock));

    sock.listeners['game:state']?.({ turn: 1, shots: [0, 0] });
    store.sendAction({ type: 'fire' }, { turn: 2, shots: [2, 0] });
    expect(effectiveView(store)).toEqual({ turn: 2, shots: [2, 0] });

    sock.listeners['game:state']?.({ turn: 2, shots: [1, 0] });
    const snap = store.getSnapshot();
    expect(snap.optimisticView).toBeNull();
    expect(snap.authoritativeState).toEqual({ turn: 2, shots: [1, 0] });
    expect(effectiveView(store)).toEqual(snap.authoritativeState);
    expect(snap.isSending).toBe(false);
  });

  it('game:reject clears the optimistic overlay and restores the authoritative view', () => {
    const sock = makeSocket();
    const store = new GameStore(asSocket(sock));

    const authoritative = { turn: 1, shots: [0, 0] };
    sock.listeners['game:state']?.(authoritative);
    store.sendAction({ type: 'fire' }, { turn: 2, shots: [2, 0] });
    expect(effectiveView(store)).toEqual({ turn: 2, shots: [2, 0] });

    sock.listeners['game:reject']?.('not your turn');
    const snap = store.getSnapshot();
    expect(snap.lastReject).toBe('not your turn');
    expect(snap.isSending).toBe(false);
    expect(snap.optimisticView).toBeNull();
    expect(effectiveView(store)).toEqual(authoritative);
  });

  it('send-timeout (3s) clears the optimistic overlay without any server response', () => {
    const sock = makeSocket();
    const store = new GameStore(asSocket(sock));

    const authoritative = { turn: 1, shots: [0, 0] };
    sock.listeners['game:state']?.(authoritative);
    store.sendAction({ type: 'fire' }, { turn: 2, shots: [2, 0] });
    expect(store.getSnapshot().isSending).toBe(true);
    expect(effectiveView(store)).toEqual({ turn: 2, shots: [2, 0] });

    vi.advanceTimersByTime(3000);
    const snap = store.getSnapshot();
    expect(snap.isSending).toBe(false);
    expect(snap.optimisticView).toBeNull();
    expect(effectiveView(store)).toEqual(authoritative);
  });
});
