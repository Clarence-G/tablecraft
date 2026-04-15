export type RoomStatus = 'waiting' | 'playing' | 'finished';

export interface PlayerInfo {
  id: string;
  name: string;
  ready: boolean;
  connected: boolean;
  seatIndex: number;
}

export interface RoomState {
  roomId: string;
  gameId: string;
  status: RoomStatus;
  hostId: string;
  players: PlayerInfo[];
  maxPlayers: number;
  config?: unknown;
  createdAt: number;
}
