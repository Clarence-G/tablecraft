import type { GameLogic, GameMeta, RoomSummary, ServerGamePlugin } from '@repo/shared';
import { desc, eq, or } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db } from '../db/index.js';
import { chatMessages, roomPlayers, rooms } from '../db/schema.js';
import { logger } from '../lib/logger.js';
import { GameRoom } from './GameRoom';

export class RoomManager {
  private rooms: Map<string, GameRoom> = new Map();
  private userToRoom: Map<string, string> = new Map();
  private cleanupTimer: NodeJS.Timeout;
  private pendingDestroyTimers: Map<string, NodeJS.Timeout> = new Map();

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
    const pending = this.pendingDestroyTimers.get(roomId);
    if (pending) {
      clearTimeout(pending);
      this.pendingDestroyTimers.delete(roomId);
    }
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

  /**
   * Destroy the room if nobody is left. Called on every leave/kick from both
   * the socket handler and the REST endpoint so empty rooms don't sit in the
   * lobby list for up to 10 minutes waiting for the periodic cleanup sweep.
   * Returns true if the room was removed.
   */
  removeIfEmpty(roomId: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    if (room.players.size > 0) return false;
    this.removeRoom(roomId);
    return true;
  }

  /**
   * Schedule a destroy 30s out if every player in the room is disconnected.
   * Cancelled on reconnect/join/explicit leave. Without this, a closed-tab
   * disconnect leaves the room in `userToRoom` so the player can't create a
   * new room from the lobby (`Already in room X` error) until the 10-minute
   * sweep finally collects it.
   */
  scheduleDestroyIfAllDisconnected(roomId: string, onDestroy?: () => void): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    if (room.players.size === 0) {
      this.removeRoom(roomId);
      onDestroy?.();
      return;
    }
    if (this.pendingDestroyTimers.has(roomId)) return;
    const allDown = [...room.players.values()].every((p) => !p.connected);
    if (!allDown) return;
    const timer = setTimeout(() => {
      this.pendingDestroyTimers.delete(roomId);
      const r = this.rooms.get(roomId);
      if (!r) return;
      // Re-check at fire time — anyone may have reconnected in 30s.
      const stillAllDown = [...r.players.values()].every((p) => !p.connected);
      if (!stillAllDown) return;
      logger.info(
        { roomId, gameId: r.gameId, status: r.status, mod: 'room-manager' },
        'destroying room: all players disconnected for 30s',
      );
      this.removeRoom(roomId);
      onDestroy?.();
    }, 30_000);
    this.pendingDestroyTimers.set(roomId, timer);
  }

  /** Cancel any pending destroy timer (called when a player rejoins/reconnects). */
  cancelPendingDestroy(roomId: string): void {
    const pending = this.pendingDestroyTimers.get(roomId);
    if (pending) {
      clearTimeout(pending);
      this.pendingDestroyTimers.delete(roomId);
    }
  }

  listRooms(): GameRoom[] {
    return [...this.rooms.values()];
  }

  listWaitingRooms(gameId?: string): RoomSummary[] {
    const result: RoomSummary[] = [];
    for (const room of this.rooms.values()) {
      if (room.status !== 'waiting') continue;
      if (room.players.size >= room.maxPlayers) continue;
      if (gameId && room.gameId !== gameId) continue;
      result.push(room.toRoomSummary());
    }
    return result;
  }

  /** Returns waiting rooms (joinable) and playing rooms (spectatable), excluding finished. */
  listActiveRooms(gameId?: string): RoomSummary[] {
    const result: RoomSummary[] = [];
    for (const room of this.rooms.values()) {
      if (room.status === 'finished') continue;
      if (room.status === 'waiting' && room.players.size >= room.maxPlayers) continue;
      if (gameId && room.gameId !== gameId) continue;
      result.push(room.toRoomSummary());
    }
    return result;
  }

  destroy(): void {
    clearInterval(this.cleanupTimer);
    for (const timer of this.pendingDestroyTimers.values()) clearTimeout(timer);
    this.pendingDestroyTimers.clear();
  }

  /** Load all playing/waiting rooms from DB into memory. Called once on boot. */
  async hydrate(registry: Record<string, ServerGamePlugin>): Promise<number> {
    const rows = await db
      .select()
      .from(rooms)
      .where(or(eq(rooms.status, 'playing'), eq(rooms.status, 'waiting')));
    let count = 0;
    for (const row of rows) {
      try {
        if (!row.stateJson) continue;
        const plugin = registry[row.gameId];
        if (!plugin) {
          logger.warn(
            { roomId: row.id, gameId: row.gameId, mod: 'room-manager' },
            'hydrate: unknown gameId, skipping',
          );
          continue;
        }
        const state: unknown = JSON.parse(row.stateJson);
        const players = await db
          .select()
          .from(roomPlayers)
          .where(eq(roomPlayers.roomId, row.id))
          .orderBy(roomPlayers.seatIndex);
        const recentChat = await db
          .select()
          .from(chatMessages)
          .where(eq(chatMessages.roomId, row.id))
          .orderBy(desc(chatMessages.createdAt))
          .limit(50);
        const room = GameRoom.fromPersisted(
          row,
          state,
          players,
          recentChat.reverse(),
          plugin.meta,
          plugin.logic,
        );
        this.rooms.set(row.id, room);
        count++;
      } catch (err) {
        logger.error({ err, roomId: row.id, mod: 'room-manager' }, 'hydrate failed for room');
      }
    }
    logger.info({ count, mod: 'room-manager' }, 'hydrated rooms from db');
    return count;
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
      // Solo-host waiting room: room has only the creator and they never got
      // a socket connection (e.g. REST-only bot spam, or abandoned auto-create).
      // 1 minute is plenty — a real host would've had at least one socket
      // heartbeat within that window. Prevents orphan rooms piling up when a
      // bot or racy client calls POST /rooms but never follows up with join.
      if (
        room.status === 'waiting' &&
        room.players.size === 1 &&
        this.allDisconnected(room) &&
        now - room.lastActivityAt > 60_000
      ) {
        logger.info(
          { roomId: id, gameId: room.gameId, mod: 'room-manager' },
          'cleanup: dropping abandoned solo-host waiting room (>1min, never connected)',
        );
        this.removeRoom(id);
        continue;
      }
      // Abandoned waiting room: no live players for >10 min — drop it.
      if (
        room.status === 'waiting' &&
        this.allDisconnected(room) &&
        now - room.lastActivityAt > 10 * 60_000
      ) {
        this.removeRoom(id);
        continue;
      }
      // Abandoned in-progress game: everyone dropped and nobody came back.
      // Without this branch a game-in-progress with no live players sits in
      // the lobby forever, because 'playing' status never self-transitions
      // to 'finished' on disconnect alone.
      if (
        room.status === 'playing' &&
        this.allDisconnected(room) &&
        now - room.lastActivityAt > 10 * 60_000
      ) {
        logger.info(
          { roomId: id, gameId: room.gameId, mod: 'room-manager' },
          'cleanup: abandoning stale playing room (all disconnected >10min)',
        );
        this.removeRoom(id);
      }
    }
  }
}
