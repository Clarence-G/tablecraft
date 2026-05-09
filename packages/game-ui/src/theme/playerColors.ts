import type { PlayerInfo } from '@repo/shared';

export interface PlayerColor {
  readonly token: string;
  readonly hex: string;
  readonly border: string;
  readonly soft: string;
  readonly text: string;
}

export const PLAYER_COLORS: readonly PlayerColor[] = [
  { token: 'player-red', hex: '#d94040', border: '#a82828', soft: '#fde8e8', text: '#7a1010' },
  { token: 'player-blue', hex: '#2563eb', border: '#1947b8', soft: '#dbeafe', text: '#0a2d6e' },
  { token: 'player-green', hex: '#16a34a', border: '#0d7537', soft: '#dcfce7', text: '#0d3a1d' },
  { token: 'player-amber', hex: '#d97706', border: '#a05305', soft: '#fef3c7', text: '#5a2a00' },
  { token: 'player-purple', hex: '#7c3aed', border: '#5b1ec0', soft: '#ede9fe', text: '#2e0d6b' },
  { token: 'player-pink', hex: '#db2777', border: '#a1195b', soft: '#fce7f3', text: '#5e0826' },
  { token: 'player-cyan', hex: '#0891b2', border: '#056484', soft: '#cffafe', text: '#062a38' },
  { token: 'player-lime', hex: '#65a30d', border: '#4c7a0a', soft: '#ecfccb', text: '#26380a' },
] as const;

export function getPlayerColor(seatIndex: number): PlayerColor {
  const n = PLAYER_COLORS.length;
  if (!Number.isFinite(seatIndex) || seatIndex < 0) return PLAYER_COLORS[0];
  return PLAYER_COLORS[Math.floor(seatIndex) % n];
}

export function getPlayerColorById(
  players: readonly PlayerInfo[] | undefined,
  id: string | undefined,
): PlayerColor | null {
  if (!id || !players || players.length === 0) return null;
  const p = players.find((x) => x.id === id);
  return p ? getPlayerColor(p.seatIndex) : null;
}
