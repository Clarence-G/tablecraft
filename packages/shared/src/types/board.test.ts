import { describe, expect, it } from 'vitest';
import type { BoardProps } from './board';

// BoardProps test focuses on the backward-compatibility contract for US-011:
// the new optional fields (pointsDelta, onReturnToRoom, onReturnToLobby) must
// not become required, otherwise every existing game's Board would break at
// type-check time.

describe('BoardProps back-compat', () => {
  it('accepts an object with only the pre-US-011 required fields', () => {
    const minimal: BoardProps<{ turn: number }, { type: 'noop' }> = {
      state: { turn: 0 },
      myId: 'p1',
      players: [],
      sendAction: () => {},
      isSending: false,
      lastReject: null,
      notifications: [],
    };
    expect(minimal.myId).toBe('p1');
  });

  it('accepts the new optional fields when provided', () => {
    const full: BoardProps<{ turn: number }, { type: 'noop' }> = {
      state: { turn: 0 },
      myId: 'p1',
      players: [],
      sendAction: () => {},
      isSending: false,
      lastReject: null,
      notifications: [],
      pointsDelta: { p1: 10, p2: 0 },
      onReturnToRoom: () => {},
      onReturnToLobby: () => {},
    };
    expect(full.pointsDelta?.p1).toBe(10);
  });
});
