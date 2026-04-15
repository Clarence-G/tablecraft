import type { ClientEvents, ServerEvents } from '@repo/shared';
import type { ServerGamePlugin } from '@repo/shared';
import type { Server, Socket } from 'socket.io';
import type { RoomManager } from '../engine/RoomManager';

type IO = Server<ClientEvents, ServerEvents>;
type Sock = Socket<ClientEvents, ServerEvents>;

export function setupHandlers(
  io: IO,
  roomManager: RoomManager,
  registry: Record<string, ServerGamePlugin>,
): void {
  // Broadcast helper: send each player their view
  const broadcastViews = (roomId: string, views: Map<string, unknown>) => {
    const sockets = io.sockets.adapter.rooms.get(roomId);
    if (!sockets) return;
    for (const [socketId] of sockets.entries?.() ?? []) {
      // no-op: views are emitted per-socket by emitToPlayer
    }
    // Actually emit via emitToPlayer bound per room
  };

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
    }

    // room:create
    socket.on('room:create', (gameId, playerName, config, ack) => {
      const plugin = registry[gameId];
      if (!plugin) return ack({ ok: false, error: 'Unknown game' });

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
      bindRoomEmitters(room, io, socket);

      const joinResult = room.join(userId, playerName);
      if (!joinResult.ok) return ack({ ok: false, error: joinResult.error });

      roomManager.onPlayerJoin(room.roomId, userId);
      socket.join(room.roomId);
      ack({ ok: true, data: { roomId: room.roomId } });
      io.to(room.roomId).emit('room:state', room.toRoomState());
    });

    // room:join
    socket.on('room:join', (roomId, playerName, ack) => {
      const room = roomManager.getRoom(roomId);
      if (!room) return ack({ ok: false, error: 'Room not found' });

      bindRoomEmitters(room, io, socket);
      const result = room.join(userId, playerName);
      if (!result.ok) return ack({ ok: false, error: result.error });

      roomManager.onPlayerJoin(roomId, userId);
      socket.join(roomId);
      ack({ ok: true, data: undefined });
      io.to(roomId).emit('room:state', room.toRoomState());
    });

    // room:leave
    socket.on('room:leave', () => {
      const room = roomManager.findRoomByUser(userId);
      if (!room) return;
      room.leave(userId);
      roomManager.onPlayerLeave(userId);
      socket.leave(room.roomId);
      io.to(room.roomId).emit('room:state', room.toRoomState());
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

      // Send each player their initial view
      const socketsInRoom = io.sockets.adapter.rooms.get(room.roomId);
      if (socketsInRoom) {
        for (const socketId of socketsInRoom) {
          const s = io.sockets.sockets.get(socketId);
          if (s) {
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
      io.to(room.roomId).emit('room:state', room.toRoomState());
    });

    // room:restart
    socket.on('room:restart', () => {
      const room = roomManager.findRoomByUser(userId);
      if (!room) return;
      room.restart();
      io.to(room.roomId).emit('room:state', room.toRoomState());
    });

    // game:action
    socket.on('game:action', (action, seq) => {
      const room = roomManager.findRoomByUser(userId);
      if (!room) return;
      room.handleAction(userId, action, seq);
    });

    // room:list
    socket.on('room:list', (gameId, ack) => {
      const rooms = roomManager.listWaitingRooms(gameId || undefined);
      ack(rooms);
    });

    // disconnect
    socket.on('disconnect', () => {
      const room = roomManager.findRoomByUser(userId);
      if (!room) return;
      room.markDisconnected(userId);
      io.to(room.roomId).emit('room:state', room.toRoomState());
    });
  });
}

function bindRoomEmitters(room: import('../engine/GameRoom').GameRoom, io: IO, socket: Sock): void {
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
