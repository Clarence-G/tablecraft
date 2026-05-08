// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { PLAYER_COLORS, getPlayerColor, getPlayerColorById } from './playerColors';
import type { PlayerInfo } from '@repo/shared';

function makePlayer(id: string, seatIndex: number): PlayerInfo {
  return { id, name: id, seatIndex, ready: true, connected: true, isBot: false };
}

describe('getPlayerColor', () => {
  it('returns distinct colors for the first N seats', () => {
    const colors = new Set<string>();
    for (let i = 0; i < PLAYER_COLORS.length; i++) {
      colors.add(getPlayerColor(i).hex);
    }
    expect(colors.size).toBe(PLAYER_COLORS.length);
  });

  it('wraps around via modulo when seatIndex exceeds palette size', () => {
    const n = PLAYER_COLORS.length;
    expect(getPlayerColor(n).hex).toBe(getPlayerColor(0).hex);
    expect(getPlayerColor(n + 3).hex).toBe(getPlayerColor(3).hex);
  });

  it('clamps negative / NaN seatIndex to the first color', () => {
    expect(getPlayerColor(-1).hex).toBe(PLAYER_COLORS[0].hex);
    expect(getPlayerColor(Number.NaN).hex).toBe(PLAYER_COLORS[0].hex);
  });

  it('floors fractional seatIndex', () => {
    expect(getPlayerColor(2.7).hex).toBe(PLAYER_COLORS[2].hex);
  });
});

describe('getPlayerColorById', () => {
  const players: PlayerInfo[] = [
    makePlayer('alice', 0),
    makePlayer('bob', 1),
    makePlayer('carol', 2),
  ];

  it('returns the color matching the player seatIndex', () => {
    expect(getPlayerColorById(players, 'bob')?.hex).toBe(PLAYER_COLORS[1].hex);
  });

  it('returns null for unknown id', () => {
    expect(getPlayerColorById(players, 'stranger')).toBeNull();
  });

  it('returns null for undefined id / empty list', () => {
    expect(getPlayerColorById(players, undefined)).toBeNull();
    expect(getPlayerColorById([], 'alice')).toBeNull();
    expect(getPlayerColorById(undefined, 'alice')).toBeNull();
  });
});
