import type { ClientEvents, ServerEvents, ServerGamePlugin } from '@repo/shared';
import { buildGameDetail } from '@repo/shared';
import { Router } from 'express';
import express from 'express';
import type { Server as IOServer } from 'socket.io';
import type { GameRoom } from '../engine/GameRoom.js';
import type { RoomManager } from '../engine/RoomManager.js';
import { moderateChat } from '../lib/moderation.js';
import { tryConsumeChatToken } from '../socket/handlers.js';
import { createApiAuth } from './auth.js';
import { registerBotsRoutes } from './bots.js';
import { registerFriendsRoutes } from './friends.js';
import { registerPointsRoutes } from './points.js';
import { registerReportsRoutes } from './reports.js';
import type { TokenStore } from './token-store.js';

function gameStateResponse(room: GameRoom, userId: string) {
  const view =
    room.status === 'playing' || room.status === 'finished'
      ? room.logic.getPlayerView(room.state, userId)
      : null;
  const result = room.rankings
    ? { rankings: room.rankings, myRank: room.rankings.indexOf(userId) + 1 }
    : null;
  // Expose the room-wide Activity Log history so CLI bots and JSON clients
  // can inspect public events without subscribing to socket `game:notify`.
  // Only entries on the 'log' sub-channel end up in logHistory — private UI
  // payloads stay out of HTTP responses.
  const notifications = room.logHistory;
  return { view, roomStatus: room.status, seq: room.seq, result, notifications };
}

export function createApiRouter(
  roomManager: RoomManager,
  registry: Record<string, ServerGamePlugin>,
  tokenStore: TokenStore,
  io: IOServer<ClientEvents, ServerEvents>,
): Router {
  const router = Router();

  // Broadcast the room state + lobby listing update to every socket.io client
  // in `roomId`. Mirrors what the socket handlers do after a state-mutating
  // event, so REST-driven mutations (bot joins / bot starts game / bot action)
  // reach every human player's browser in real time without relying on
  // manual refresh.
  const broadcastRoomState = (room: GameRoom) => {
    io.to(room.roomId).emit('room:state', room.toRoomState());
    io.emit('rooms:updated');
  };
  const auth = createApiAuth(tokenStore);

  router.use(express.json());

  // Points, leaderboard, and guest-merge routes (Stage 4b). Session-based;
  // kept in a separate module to keep this file focused on the bot-bearer
  // room/game routes. Registered before the bot-auth routes so session
  // middleware (mounted globally in `index.ts` on `/api`) is in scope.
  registerPointsRoutes(router);
  registerReportsRoutes(router);
  registerFriendsRoutes(router, roomManager);
  registerBotsRoutes(router, tokenStore);

  // --- Admin endpoints (dev only; gated in production) ---

  router.post('/admin/token', async (req, res) => {
    if (process.env.NODE_ENV === 'production') {
      return res.status(404).json({ ok: false, error: 'Not found' });
    }
    const name = req.body?.name || 'Bot';
    const result = await tokenStore.generate(name);
    res.status(201).json({ ok: true, data: result });
  });

  // --- Public endpoints ---

  router.get('/games', (_req, res) => {
    const games = Object.values(registry).map((g) => ({
      id: g.meta.id,
      name: g.meta.name,
      description: g.meta.description,
      minPlayers: g.meta.minPlayers,
      maxPlayers: g.meta.maxPlayers,
      tags: g.meta.tags ?? [],
      agentRules: g.meta.agentRules ?? null,
    }));
    res.json({ ok: true, data: games });
  });

  router.get('/games/:gameId', (req, res) => {
    const plugin = registry[req.params.gameId];
    if (!plugin) {
      res.status(404).json({
        ok: false,
        error: 'UNKNOWN_GAME',
        message: `Game "${req.params.gameId}" not found`,
        hint: 'Use GET /api/games to list available games',
      });
      return;
    }
    res.json({
      ok: true,
      data: buildGameDetail(plugin.meta, plugin.logic),
    });
  });

  // --- Authenticated endpoints ---

  router.get('/bot/whoami', auth, (req, res) => {
    res.json({ ok: true, data: { userId: req.botUserId, name: req.botUserName } });
  });

  router.get('/rooms', auth, (req, res) => {
    const gameFilter = typeof req.query.game === 'string' ? req.query.game : undefined;
    const rooms = roomManager.listWaitingRooms(gameFilter);
    res.json({ ok: true, data: rooms });
  });

  router.post('/rooms', auth, (req, res) => {
    const { gameId, config } = req.body ?? {};
    if (!gameId || typeof gameId !== 'string') {
      res.status(400).json({
        ok: false,
        error: 'UNKNOWN_GAME',
        message: 'gameId is required',
        hint: 'Provide { "gameId": "..." } in the request body',
      });
      return;
    }
    const plugin = registry[gameId];
    if (!plugin) {
      res.status(404).json({
        ok: false,
        error: 'UNKNOWN_GAME',
        message: `Game "${gameId}" not found`,
        hint: 'Use GET /api/games to list available games',
      });
      return;
    }

    const userId = req.botUserId!;
    const userName = req.botUserName!;

    // Enforce "one active room per user": if the caller is already hosting or
    // seated in a non-finished room, refuse to create another. Without this a
    // bot or client can spam POST /rooms and leave a trail of abandoned empty
    // waiting-rooms in the lobby (28 such rooms observed in prod before fix).
    // Clients can recover by calling leave on the existing room first, OR by
    // passing { "force": true } in the body to auto-leave the stale room
    // first (useful for test scripts that reuse bot names across runs).
    const existingRoom = roomManager.findRoomByUser(userId);
    if (existingRoom && existingRoom.status !== 'finished') {
      const force =
        req.body &&
        typeof req.body === 'object' &&
        (req.body as Record<string, unknown>).force === true;
      if (force) {
        existingRoom.leave(userId);
        roomManager.onPlayerLeave(userId);
        if (!roomManager.removeIfEmpty(existingRoom.roomId)) {
          io.to(existingRoom.roomId).emit('room:state', existingRoom.toRoomState());
        }
        io.emit('rooms:updated');
        // fall through to create new room below
      } else {
        res.status(409).json({
          ok: false,
          error: 'ALREADY_IN_ROOM',
          message: `User is already in room "${existingRoom.roomId}" (${existingRoom.gameId}, ${existingRoom.status})`,
          hint: 'Leave the existing room first (POST /rooms/:id/leave) or pass { "force": true }',
          data: existingRoom.toRoomSummary(),
        });
        return;
      }
    }

    const room = roomManager.createRoom(gameId, plugin.meta, plugin.logic, userId, config);
    room.join(userId, userName, true);
    roomManager.onPlayerJoin(room.roomId, userId);
    room.onStateChanged();

    // New room appeared in the lobby; tell every connected client to refresh
    // its lobby listing. (No room-scoped broadcast yet because nobody else has
    // subscribed to this new roomId.)
    io.emit('rooms:updated');

    res.status(201).json({ ok: true, data: room.toRoomState() });
  });

  router.get('/rooms/:id', auth, (req, res) => {
    const room = roomManager.getRoom(req.params.id);
    if (!room) {
      res.status(404).json({
        ok: false,
        error: 'ROOM_NOT_FOUND',
        message: `Room "${req.params.id}" not found`,
        hint: 'Use GET /api/rooms to list available rooms',
      });
      return;
    }
    res.json({ ok: true, data: room.toRoomState() });
  });

  router.post('/rooms/:id/join', auth, (req, res) => {
    const room = roomManager.getRoom(req.params.id);
    if (!room) {
      res.status(404).json({
        ok: false,
        error: 'ROOM_NOT_FOUND',
        message: `Room "${req.params.id}" not found`,
        hint: 'Use GET /api/rooms to list available rooms',
      });
      return;
    }

    const userId = req.botUserId!;

    // Idempotent: already in room
    if (room.players.has(userId)) {
      res.json({ ok: true, data: room.toRoomState() });
      return;
    }

    if (room.status !== 'waiting') {
      res.status(409).json({
        ok: false,
        error: 'GAME_ALREADY_STARTED',
        message: 'Cannot join a room that is already in progress',
        hint: 'Wait for the game to finish or join a different room',
      });
      return;
    }

    if (room.players.size >= room.meta.maxPlayers) {
      res.status(409).json({
        ok: false,
        error: 'ROOM_FULL',
        message: `Room is full (${room.meta.maxPlayers} players max)`,
        hint: 'Create a new room or join a different one',
      });
      return;
    }

    room.join(userId, req.botUserName!, true);
    roomManager.onPlayerJoin(room.roomId, userId);
    room.onStateChanged();
    broadcastRoomState(room);

    res.json({ ok: true, data: room.toRoomState() });
  });

  router.post('/rooms/:id/leave', auth, (req, res) => {
    const room = roomManager.getRoom(req.params.id);
    if (!room) {
      // Idempotent: room not found = success
      res.json({ ok: true, data: null });
      return;
    }

    const userId = req.botUserId!;

    if (!room.players.has(userId)) {
      // Idempotent: not in room = success
      res.json({ ok: true, data: null });
      return;
    }

    room.leave(userId);
    roomManager.onPlayerLeave(userId);
    room.onStateChanged();

    // Broadcast remaining state to the room BEFORE we potentially destroy it,
    // then signal the lobby so empty-room cleanup is visible everywhere.
    broadcastRoomState(room);

    // Clean up empty rooms
    if (room.players.size === 0) {
      roomManager.removeRoom(room.roomId);
      io.emit('rooms:updated');
    }

    res.json({ ok: true, data: null });
  });

  router.post('/rooms/:id/start', auth, (req, res) => {
    const room = roomManager.getRoom(req.params.id);
    if (!room) {
      res.status(404).json({
        ok: false,
        error: 'ROOM_NOT_FOUND',
        message: `Room "${req.params.id}" not found`,
        hint: 'Use GET /api/rooms to list available rooms',
      });
      return;
    }

    const userId = req.botUserId!;

    if (room.hostId !== userId) {
      res.status(403).json({
        ok: false,
        error: 'NOT_HOST',
        message: 'Only the room host can start the game',
        hint: 'The first player to join is the host',
      });
      return;
    }

    const result = room.start();
    if (!result.ok) {
      // Map start errors
      const error = result.error.includes('ready') ? 'PLAYERS_NOT_READY' : 'GAME_ALREADY_STARTED';
      res.status(409).json({
        ok: false,
        error,
        message: result.error,
        hint: error === 'PLAYERS_NOT_READY' ? 'All players must be ready before starting' : '',
      });
      return;
    }

    // CRITICAL: broadcast start transition to every subscriber. Otherwise
    // human players whose socket is sitting in the lobby/waiting view will
    // stay stuck on the old status=waiting state until they manually refresh
    // (because the state change happened server-side via REST, not through
    // the socket 'room:start' handler). Mirrors socket/handlers.ts `room:start`.
    broadcastRoomState(room);
    for (const playerId of room.players.keys()) {
      const view = room.logic.getPlayerView(room.state, playerId);
      room.emitToPlayer?.(playerId, 'game:state', view);
    }

    res.json({ ok: true, data: room.toRoomState() });
  });

  router.get('/rooms/:id/state', auth, (req, res) => {
    const room = roomManager.getRoom(req.params.id);
    if (!room) {
      res.status(404).json({
        ok: false,
        error: 'ROOM_NOT_FOUND',
        message: `Room "${req.params.id}" not found`,
        hint: 'Use GET /api/rooms to list available rooms',
      });
      return;
    }

    const userId = req.botUserId!;

    if (!room.players.has(userId)) {
      res.status(403).json({
        ok: false,
        error: 'NOT_IN_ROOM',
        message: 'You are not a player in this room',
        hint: 'Join the room first via POST /api/rooms/:id/join',
      });
      return;
    }

    res.json({ ok: true, data: gameStateResponse(room, userId) });
  });

  router.post('/rooms/:id/action', auth, (req, res) => {
    const room = roomManager.getRoom(req.params.id);
    if (!room) {
      res.status(404).json({
        ok: false,
        error: 'ROOM_NOT_FOUND',
        message: `Room "${req.params.id}" not found`,
        hint: 'Use GET /api/rooms to list available rooms',
      });
      return;
    }

    const userId = req.botUserId!;

    if (!room.players.has(userId)) {
      res.status(403).json({
        ok: false,
        error: 'NOT_IN_ROOM',
        message: 'You are not a player in this room',
        hint: 'Join the room first via POST /api/rooms/:id/join',
      });
      return;
    }

    const { action, seq } = req.body ?? {};
    const result = room.submitAction(userId, action, seq);

    if (!result.ok) {
      const statusMap: Record<string, number> = {
        INVALID_ACTION: 400,
        ACTION_REJECTED: 409,
        GAME_NOT_STARTED: 409,
        THROTTLED: 429,
      };
      const status = statusMap[result.error] ?? 400;
      res.status(status).json({
        ok: false,
        error: result.error,
        message: result.reason,
        hint: result.error === 'THROTTLED' ? 'Wait before submitting the next action' : '',
      });
      return;
    }

    res.json({ ok: true, data: gameStateResponse(room, userId) });
  });

  router.get('/rooms/:id/wait', auth, async (req, res) => {
    const room = roomManager.getRoom(req.params.id);
    if (!room) {
      res.status(404).json({
        ok: false,
        error: 'ROOM_NOT_FOUND',
        message: `Room "${req.params.id}" not found`,
        hint: 'Use GET /api/rooms to list available rooms',
      });
      return;
    }

    const userId = req.botUserId!;

    if (!room.players.has(userId)) {
      res.status(403).json({
        ok: false,
        error: 'NOT_IN_ROOM',
        message: 'You are not a player in this room',
        hint: 'Join the room first via POST /api/rooms/:id/join',
      });
      return;
    }

    const afterParam = req.query.after;
    const afterSeq = afterParam !== undefined ? Number(afterParam) : room.seq;
    const timeoutParam = req.query.timeout;
    let timeoutSec = timeoutParam !== undefined ? Number(timeoutParam) : 30;
    timeoutSec = Math.min(Math.max(timeoutSec, 1), 120);

    const newSeq = await room.waitForChange(afterSeq, timeoutSec * 1000);

    if (newSeq === null) {
      res.json({ ok: true, data: { changed: false } });
      return;
    }

    res.json({ ok: true, data: { changed: true, ...gameStateResponse(room, userId) } });
  });

  router.post('/rooms/:id/chat', auth, (req, res) => {
    const room = roomManager.getRoom(req.params.id);
    if (!room) {
      res.status(404).json({
        ok: false,
        error: 'ROOM_NOT_FOUND',
        message: `Room "${req.params.id}" not found`,
        hint: 'Use GET /api/rooms to list available rooms',
      });
      return;
    }

    const userId = req.botUserId!;

    if (!room.players.has(userId)) {
      res.status(403).json({
        ok: false,
        error: 'NOT_A_PLAYER',
        message: 'You are not a player in this room',
        hint: 'Join the room first via POST /api/rooms/:id/join',
      });
      return;
    }

    const rawText = req.body?.text;
    if (typeof rawText !== 'string' || !rawText.trim()) {
      res.status(400).json({
        ok: false,
        error: 'INVALID_INPUT',
        message: 'text is required and must be non-empty',
        hint: 'Provide { "text": "..." } in the request body',
      });
      return;
    }

    const text = rawText.trim().slice(0, 500);

    if (!tryConsumeChatToken(userId)) {
      res.status(429).json({
        ok: false,
        error: 'RATE_LIMITED',
        message: 'Too many messages, slow down',
        hint: 'Wait a moment before sending another message',
      });
      return;
    }

    const mod = moderateChat(text);
    if (!mod.ok) {
      res.status(400).json({
        ok: false,
        error: 'MODERATED',
        message: 'Message blocked by moderation',
        hint: '',
      });
      return;
    }

    const now = Date.now();
    const player = room.players.get(userId);
    const msg = {
      id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
      from: userId,
      fromName: player?.name ?? userId,
      text,
      at: now,
    };
    room.appendChatMessage(msg);
    io.to(room.roomId).emit('chat:message', msg);

    res.json({ ok: true, data: msg });
  });

  router.get('/rooms/:id/chat', auth, (req, res) => {
    const room = roomManager.getRoom(req.params.id);
    if (!room) {
      res.status(404).json({
        ok: false,
        error: 'ROOM_NOT_FOUND',
        message: `Room "${req.params.id}" not found`,
        hint: 'Use GET /api/rooms to list available rooms',
      });
      return;
    }

    const userId = req.botUserId!;

    if (!room.players.has(userId)) {
      res.status(403).json({
        ok: false,
        error: 'NOT_A_PLAYER',
        message: 'You are not a player in this room',
        hint: 'Join the room first via POST /api/rooms/:id/join',
      });
      return;
    }

    const afterParam = req.query.after;
    const tailParam = req.query.tail;
    let messages = room.chatHistory.slice();

    if (afterParam !== undefined) {
      const after = Number(afterParam);
      messages = messages.filter((m) => m.at > after);
    } else {
      const tail = tailParam !== undefined ? Math.min(Number(tailParam), 200) : 50;
      messages = messages.slice(-tail);
    }

    const lastAt =
      messages.length > 0
        ? messages[messages.length - 1].at
        : afterParam !== undefined
          ? Number(afterParam)
          : 0;

    res.json({ ok: true, data: { messages, lastAt } });
  });

  return router;
}
