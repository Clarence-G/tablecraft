import type { GameLogic, GameMeta, RoomSummary } from '@repo/shared';
import { nanoid } from 'nanoid';
import { GameRoom } from './GameRoom';

export class RoomManager {
  private rooms: Map<string, GameRoom> = new Map();
  private userToRoom: Map<string, string> = new Map();
  private cleanupTimer: NodeJS.Timeout;

  constructor() {
    this.cleanupTimer = setInterval(() => this.cleanup(), 60_000);
  }

  createRoom(
    gameId: string,
    meta: GameMeta,
    logic: GameLogic,
    hostId: string,
    config?: unknown,
  ): GameRoom {
    const room = new GameRoom(gameId, meta, config, logic);
    this.rooms.set(room.roomId, room);
    return room;
  }

  getRoom(roomId: string): GameRoom | undefined {
    return this.rooms.get(roomId);
  }

  findRoomByUser(userId: string): GameRoom | undefined {
    const roomId = this.userToRoom.get(userId);
    if (!roomId) return undefined;
    return this.rooms.get(roomId);
  }

  removeRoom(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (room) {
      room.timerManager.clearAll();
      for (const pid of room.players.keys()) {
        this.userToRoom.delete(pid);
      }
    }
    this.rooms.delete(roomId);
  }

  onPlayerJoin(roomId: string, userId: string): void {
    this.userToRoom.set(userId, roomId);
  }

  onPlayerLeave(userId: string): void {
    this.userToRoom.delete(userId);
  }

  listRooms(): GameRoom[] {
    return [...this.rooms.values()];
  }

  listWaitingRooms(gameId?: string): RoomSummary[] {
    const result: RoomSummary[] = [];
    for (const room of this.rooms.values()) {
      if (room.status !== 'waiting') continue;
      if (room.players.size >= room.meta.maxPlayers) continue;
      if (gameId && room.gameId !== gameId) continue;
      result.push(room.toRoomSummary());
    }
    return result;
  }

  destroy(): void {
    clearInterval(this.cleanupTimer);
  }

  private allDisconnected(room: GameRoom): boolean {
    return [...room.players.values()].every((p) => !p.connected);
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [id, room] of this.rooms) {
      if (room.status === 'finished' && room.finishedAt && now - room.finishedAt > 5 * 60_000) {
        this.removeRoom(id);
        continue;
      }
      if (
        room.status === 'waiting' &&
        this.allDisconnected(room) &&
        now - room.lastActivityAt > 10 * 60_000
      ) {
        this.removeRoom(id);
      }
    }
  }
}
