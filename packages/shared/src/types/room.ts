export type RoomStatus = 'waiting' | 'playing' | 'finished';

export interface PlayerInfo {
  id: string;
  name: string;
  ready: boolean;
  connected: boolean;
  seatIndex: number;
  isBot: boolean;
  /**
   * Distinguishes anonymous guests from authenticated users.
   * Optional for backwards compatibility — absent means "guest" (safer default
   * for the points ledger, which has separate user_id/guest_id columns).
   */
  isGuest?: boolean;
}

export interface RoomState {
  roomId: string;
  gameId: string;
  status: RoomStatus;
  hostId: string;
  players: PlayerInfo[];
  minPlayers: number;
  maxPlayers: number;
  config?: unknown;
  createdAt: number;
  spectatorCount: number;
}

export interface RoomSummary {
  roomId: string;
  gameId: string;
  gameName: string;
  hostName: string;
  playerCount: number;
  maxPlayers: number;
  status: RoomStatus;
}
