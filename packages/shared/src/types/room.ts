export type RoomStatus = 'waiting' | 'playing' | 'finished';

export interface PlayerInfo {
  id: string;
  name: string;
  ready: boolean;
  connected: boolean;
  seatIndex: number;
  isBot: boolean;
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
}

export interface RoomSummary {
  roomId: string;
  gameId: string;
  gameName: string;
  hostName: string;
  playerCount: number;
  maxPlayers: number;
}
