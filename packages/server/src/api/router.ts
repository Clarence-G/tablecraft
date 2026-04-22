import type { ServerGamePlugin } from '@repo/shared';
import { buildGameDetail } from '@repo/shared';
import { Router } from 'express';
import express from 'express';
import type { GameRoom } from '../engine/GameRoom.js';
import type { RoomManager } from '../engine/RoomManager.js';
import { createApiAuth } from './auth.js';
import { registerPointsRoutes } from './points.js';
import type { TokenStore } from './token-store.js';

function gameStateResponse(room: GameRoom, userId: string) {
  const view =
    room.status === 'playing' || room.status === 'finished'
      ? room.logic.getPlayerView(room.state, userId)
      : null;
  const result = room.rankings
    ? { rankings: room.rankings, myRank: room.rankings.indexOf(userId) + 1 }
    : null;
  return { view, roomStatus: room.status, seq: room.seq, result };
}

export function createApiRouter(
  roomManager: RoomManager,
  registry: Record<string, ServerGamePlugin>,
  tokenStore: TokenStore,
): Router {
  const router = Router();
  const auth = createApiAuth(tokenStore);

  router.use(express.json());

  // Points, leaderboard, and guest-merge routes (Stage 4b). Session-based;
  // kept in a separate module to keep this file focused on the bot-bearer
  // room/game routes. Registered before the bot-auth routes so session
  // middleware (mounted globally in `index.ts` on `/api`) is in scope.
  registerPointsRoutes(router);

  // --- Admin endpoints (dev only) ---

  router.post('/admin/token', async (req, res) => {
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
    const room = roomManager.createRoom(gameId, plugin.meta, plugin.logic, userId, config);
    room.join(userId, userName, true);
    roomManager.onPlayerJoin(room.roomId, userId);
    room.onStateChanged();

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

    // Clean up empty rooms
    if (room.players.size === 0) {
      roomManager.removeRoom(room.roomId);
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

  return router;
}
