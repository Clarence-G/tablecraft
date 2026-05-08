import type { ClientEvents, ServerEvents } from '@repo/shared';
import type { ServerGamePlugin } from '@repo/shared';
import { and, eq } from 'drizzle-orm';
import type { Server, Socket } from 'socket.io';
import { db } from '../db/index.js';
import { userBlocks } from '../db/schema.js';
import type { RoomManager } from '../engine/RoomManager';
import { track } from '../lib/analytics';
import { logger } from '../lib/logger';
import { moderateChat } from '../lib/moderation';

type IO = Server<ClientEvents, ServerEvents>;
type Sock = Socket<ClientEvents, ServerEvents>;

// Per-user token-bucket for chat rate limiting. Shared between socket and REST
// handlers so all send paths are throttled together.
const chatBuckets = new Map<string, { last: number; tokens: number }>();

export function tryConsumeChatToken(userId: string): boolean {
  let bucket = chatBuckets.get(userId);
  if (!bucket) {
    bucket = { last: Date.now(), tokens: 5 };
    chatBuckets.set(userId, bucket);
  }
  const now = Date.now();
  const refill = Math.floor((now - bucket.last) / 1000);
  if (refill > 0) {
    bucket.tokens = Math.min(5, bucket.tokens + refill);
    bucket.last = now;
  }
  if (bucket.tokens <= 0) return false;
  bucket.tokens -= 1;
  return true;
}

export function setupHandlers(
  io: IO,
  roomManager: RoomManager,
  registry: Record<string, ServerGamePlugin>,
): void {
  io.on('connection', (socket: Sock) => {
    const userId = socket.data.userId;

    // Auto-rejoin if user was in a room
    const existingRoom = roomManager.findRoomByUser(userId);
    if (existingRoom) {
      existingRoom.markReconnected(userId);
      socket.join(existingRoom.roomId);
      socket.emit('room:state', existingRoom.toRoomState());
      if (existingRoom.status === 'playing') {
        const view = existingRoom.logic.getPlayerView(existingRoom.state, userId);
        socket.emit('game:state', view);
      }
      if (existingRoom.chatHistory.length > 0) {
        socket.emit('chat:history', existingRoom.chatHistory);
      }
      logger.info({ mod: 'reconnect', userId, roomId: existingRoom.roomId }, 'player reconnected');
    }

    // room:create
    socket.on('room:create', (gameId, playerName, config, ack) => {
      const plugin = registry[gameId];
      if (!plugin) return ack({ ok: false, error: 'Unknown game' });

      // Enforce "one active room per user" at the socket layer too. Without
      // this, a client can race-call room:create repeatedly (double-click,
      // reconnect-then-create) and leave orphan waiting-rooms behind.
      const alreadyIn = roomManager.findRoomByUser(userId);
      if (alreadyIn && alreadyIn.status !== 'finished') {
        return ack({
          ok: false,
          error: `Already in room ${alreadyIn.roomId} (${alreadyIn.status}). Leave it first.`,
        });
      }

      let validatedConfig = plugin.meta.defaultConfig;
      if (plugin.meta.configSchema && config !== undefined) {
        const result = plugin.meta.configSchema.safeParse(config);
        if (!result.success) {
          return ack({ ok: false, error: `Invalid config: ${result.error.message}` });
        }
        validatedConfig = result.data;
      }

      const room = roomManager.createRoom(
        gameId,
        plugin.meta,
        plugin.logic,
        userId,
        validatedConfig,
      );
      bindRoomEmitters(room, io);

      const joinResult = room.join(userId, playerName, false, socket.data.isGuest ?? true);
      if (!joinResult.ok) return ack({ ok: false, error: joinResult.error });

      roomManager.onPlayerJoin(room.roomId, userId);
      socket.join(room.roomId);
      ack({ ok: true, data: { roomId: room.roomId } });
      track(userId, 'room_created', { gameId: room.gameId, roomId: room.roomId });
      io.to(room.roomId).emit('room:state', room.toRoomState());
      io.emit('rooms:updated');
    });

    // room:join
    socket.on('room:join', (roomId, playerName, ack) => {
      const room = roomManager.getRoom(roomId);
      if (!room) return ack({ ok: false, error: 'Room not found' });

      bindRoomEmitters(room, io);
      const result = room.join(userId, playerName, false, socket.data.isGuest ?? true);
      if (!result.ok) return ack({ ok: false, error: result.error });

      roomManager.onPlayerJoin(roomId, userId);
      socket.join(roomId);
      ack({ ok: true, data: undefined });
      io.to(roomId).emit('room:state', room.toRoomState());
      if (room.chatHistory.length > 0) {
        socket.emit('chat:history', room.chatHistory);
      }
      io.emit('rooms:updated');
    });

    // room:leave
    socket.on('room:leave', () => {
      const room = roomManager.findRoomByUser(userId);
      if (!room) return;
      room.leave(userId);
      roomManager.onPlayerLeave(userId);
      socket.leave(room.roomId);
      socket.emit('room:left');
      if (!roomManager.removeIfEmpty(room.roomId)) {
        io.to(room.roomId).emit('room:state', room.toRoomState());
      }
      io.emit('rooms:updated');
    });

    // room:ready
    socket.on('room:ready', () => {
      const room = roomManager.findRoomByUser(userId);
      if (!room) return;
      room.ready(userId);
      io.to(room.roomId).emit('room:state', room.toRoomState());
    });

    // room:start
    socket.on('room:start', (ack) => {
      const room = roomManager.findRoomByUser(userId);
      if (!room) return ack({ ok: false, error: 'Not in a room' });
      if (room.hostId !== userId) return ack({ ok: false, error: 'Only host can start' });

      const result = room.start();
      if (!result.ok) return ack({ ok: false, error: result.error });

      ack({ ok: true, data: undefined });
      io.to(room.roomId).emit('room:state', room.toRoomState());
      // Room leaves the waiting list once it starts.
      io.emit('rooms:updated');

      // Send each player their initial view (skip spectators - none should exist yet)
      const socketsInRoom = io.sockets.adapter.rooms.get(room.roomId);
      if (socketsInRoom) {
        for (const socketId of socketsInRoom) {
          const s = io.sockets.sockets.get(socketId);
          if (s && room.players.has(s.data.userId)) {
            const view = room.logic.getPlayerView(room.state, s.data.userId);
            s.emit('game:state', view);
          }
        }
      }
    });

    // room:kick
    socket.on('room:kick', (playerId) => {
      const room = roomManager.findRoomByUser(userId);
      if (!room || room.hostId !== userId) return;
      room.leave(playerId);
      roomManager.onPlayerLeave(playerId);
      const socketsInRoom = io.sockets.adapter.rooms.get(room.roomId);
      if (socketsInRoom) {
        for (const socketId of socketsInRoom) {
          const s = io.sockets.sockets.get(socketId);
          if (s && s.data.userId === playerId) {
            s.leave(room.roomId);
            s.emit('room:left');
          }
        }
      }
      if (!roomManager.removeIfEmpty(room.roomId)) {
        io.to(room.roomId).emit('room:state', room.toRoomState());
      }
      io.emit('rooms:updated');
    });

    // room:restart
    socket.on('room:restart', () => {
      const room = roomManager.findRoomByUser(userId);
      if (!room) return;
      room.restart();
      io.to(room.roomId).emit('room:state', room.toRoomState());
      // restart flips status back to waiting → reappears in the list.
      io.emit('rooms:updated');
    });

    // game:action
    socket.on('game:action', (action, seq) => {
      const room = roomManager.findRoomByUser(userId);
      if (!room) {
        socket.emit('game:reject', 'Not a player in any active room');
        return;
      }
      room.handleAction(userId, action, seq);
    });

    // room:list
    socket.on('room:list', (gameId, ack) => {
      const rooms = roomManager.listActiveRooms(gameId || undefined);
      ack(rooms);
    });

    // room:resume — explicit resume for race-condition recovery
    socket.on('room:resume', (ack) => {
      const room = roomManager.findRoomByUser(userId);
      if (!room) return ack({ ok: true, data: null });
      ack({ ok: true, data: { roomId: room.roomId } });
    });

    // room:spectate
    socket.on('room:spectate', async (roomId, ack) => {
      const room = roomManager.getRoom(roomId);
      if (!room) return ack({ ok: false, error: 'Room not found' });
      if (room.status === 'waiting') return ack({ ok: false, error: 'Game not started yet' });

      // Block check: skip for guests (no persistent user identity)
      if (!socket.data.isGuest) {
        try {
          const hostId = room.hostId;
          if (hostId) {
            const blocked = await db
              .select()
              .from(userBlocks)
              .where(and(eq(userBlocks.blockerId, userId), eq(userBlocks.blockedId, hostId)))
              .limit(1);
            if (blocked.length > 0) return ack({ ok: false, error: 'blocked' });
          }
        } catch {
          // DB errors must not block spectating
        }
      }

      room.addSpectator(userId, socket.id);
      socket.data.spectatingRoomId = roomId;
      socket.join(roomId);
      ack({ ok: true, data: { state: room.spectatorView() } });
      io.to(roomId).emit('room:state', room.toRoomState());
    });

    // room:unspectate
    socket.on('room:unspectate', () => {
      const spectatingRoomId = socket.data.spectatingRoomId as string | undefined;
      if (!spectatingRoomId) return;
      const room = roomManager.getRoom(spectatingRoomId);
      if (room) {
        room.removeSpectator(userId);
        socket.leave(spectatingRoomId);
        io.to(spectatingRoomId).emit('room:state', room.toRoomState());
      }
      socket.data.spectatingRoomId = undefined;
    });

    // chat:send — broadcast a text message to everyone in the sender's room.
    // No persistence beyond in-memory chatHistory on the GameRoom.
    socket.on('chat:send', (rawText) => {
      if (typeof rawText !== 'string') return;
      const text = rawText.trim().slice(0, 500);
      if (!text) return;

      if (!tryConsumeChatToken(userId)) return;

      const mod = moderateChat(text);
      if (!mod.ok) {
        logger.info({ userId, match: mod.match, mod: 'moderation' }, 'chat message blocked');
        socket.emit('chat:blocked', { reason: mod.reason });
        return;
      }

      const room = roomManager.findRoomByUser(userId);
      if (!room) return;
      const player = room.players.get(userId);
      const now = Date.now();
      const msg = {
        id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
        from: userId,
        fromName: player?.name ?? userId,
        text,
        at: now,
      };
      room.appendChatMessage(msg);
      io.to(room.roomId).emit('chat:message', msg);
    });

    // disconnect
    socket.on('disconnect', () => {
      // Cleanup spectator state
      const spectatingRoomId = socket.data.spectatingRoomId as string | undefined;
      if (spectatingRoomId) {
        const spectatedRoom = roomManager.getRoom(spectatingRoomId);
        if (spectatedRoom) {
          spectatedRoom.removeSpectator(userId);
          io.to(spectatingRoomId).emit('room:state', spectatedRoom.toRoomState());
        }
      }

      const room = roomManager.findRoomByUser(userId);
      if (!room) return;
      room.markDisconnected(userId);
      io.to(room.roomId).emit('room:state', room.toRoomState());
    });
  });
}

function bindRoomEmitters(room: import('../engine/GameRoom').GameRoom, io: IO): void {
  // emitToPlayer: find socket for that player and emit
  room.emitToPlayer = (playerID: string, event: string, data?: unknown) => {
    const socketsInRoom = io.sockets.adapter.rooms.get(room.roomId);
    if (!socketsInRoom) return;
    for (const socketId of socketsInRoom) {
      const s = io.sockets.sockets.get(socketId);
      if (s && s.data.userId === playerID) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (s as any).emit(event, data);
      }
    }
  };

  // emitSpectators: send to all current spectator sockets
  room.emitSpectators = (event: string, data: unknown) => {
    for (const sockId of room.spectators.values()) {
      const s = io.sockets.sockets.get(sockId);
      if (s) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (s as any).emit(event, data);
      }
    }
  };

  // broadcast views after action
  room.setBroadcast((roomId, views) => {
    const socketsInRoom = io.sockets.adapter.rooms.get(roomId);
    if (!socketsInRoom) return;
    for (const socketId of socketsInRoom) {
      const s = io.sockets.sockets.get(socketId);
      if (s) {
        const view = views.get(s.data.userId);
        if (view !== undefined) {
          s.emit('game:state', view);
        }
      }
    }
  });
}
