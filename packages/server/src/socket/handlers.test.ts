import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type {
  Ack,
  ActionResult,
  ClientEvents,
  GameContext,
  GameLogic,
  GameMeta,
  RoomState,
  RoomSummary,
  ServerEvents,
  ServerGamePlugin,
} from '@repo/shared';
import { Server } from 'socket.io';
import { type Socket as ClientSocket, io as ioClient } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { RoomManager } from '../engine/RoomManager.js';
import { setupHandlers } from './handlers.js';

const ActionSchema = z.object({ type: z.literal('noop') });

function makePlugin(id = 'test'): ServerGamePlugin {
  const logic: GameLogic<Record<string, unknown>, z.infer<typeof ActionSchema>, unknown> = {
    actions: ActionSchema,
    setup: (_ctx: GameContext) => ({}),
    onAction: (state): ActionResult<Record<string, unknown>> => ({ ok: true, state }),
    getPlayerView: (state) => state,
  };
  const meta: GameMeta = {
    id,
    name: 'Test',
    description: '',
    minPlayers: 2,
    maxPlayers: 2,
  };
  return { meta, logic: logic as GameLogic };
}

/** Plugin with a wider player range and a configSchema so we can exercise
 * room:updateOptions validation (maxPlayers bounds + configSchema.safeParse). */
function makeConfigurablePlugin(id = 'configurable'): ServerGamePlugin {
  const logic: GameLogic<Record<string, unknown>, z.infer<typeof ActionSchema>, unknown> = {
    actions: ActionSchema,
    setup: (_ctx: GameContext) => ({}),
    onAction: (state): ActionResult<Record<string, unknown>> => ({ ok: true, state }),
    getPlayerView: (state) => state,
  };
  const configSchema = z.object({
    fastMode: z.boolean().default(false),
    rounds: z.number().int().min(1).max(10).default(3),
  });
  const meta: GameMeta = {
    id,
    name: 'Configurable',
    description: '',
    minPlayers: 2,
    maxPlayers: 6,
    configSchema,
    defaultConfig: { fastMode: false, rounds: 3 },
  };
  return { meta, logic: logic as GameLogic };
}

type TC = ClientSocket<ServerEvents, ClientEvents>;

describe('socket handlers: leave/kick cleanup', () => {
  let httpServer: ReturnType<typeof createServer>;
  let io: Server<ClientEvents, ServerEvents>;
  let roomManager: RoomManager;
  let port: number;

  beforeEach(async () => {
    httpServer = createServer();
    io = new Server<ClientEvents, ServerEvents>(httpServer);
    // Trust the handshake identity — real code runs BetterAuth in setupAuth,
    // but these tests target handler behavior, not auth.
    io.use((socket, next) => {
      const { userId, userName, isGuest } = socket.handshake.auth as {
        userId: string;
        userName?: string;
        isGuest?: boolean;
      };
      socket.data.userId = userId;
      socket.data.userName = userName ?? userId;
      socket.data.isGuest = isGuest ?? true;
      next();
    });

    roomManager = new RoomManager();
    setupHandlers(io, roomManager, { test: makePlugin('test') });

    await new Promise<void>((resolve) => httpServer.listen(0, () => resolve()));
    port = (httpServer.address() as AddressInfo).port;
  });

  afterEach(async () => {
    roomManager.destroy();
    io.close();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  function connect(userId: string, userName = userId): Promise<TC> {
    return new Promise((resolve, reject) => {
      const sock: TC = ioClient(`http://localhost:${port}`, {
        auth: { userId, userName, isGuest: true },
        transports: ['websocket'],
        reconnection: false,
        forceNew: true,
      });
      sock.on('connect', () => resolve(sock));
      sock.on('connect_error', reject);
    });
  }

  function createRoom(sock: TC, playerName: string): Promise<string> {
    return new Promise((resolve, reject) => {
      sock.emit('room:create', 'test', playerName, undefined, (result) => {
        if (result.ok) resolve(result.data.roomId);
        else reject(new Error(result.error));
      });
    });
  }

  function joinRoom(sock: TC, roomId: string, playerName: string): Promise<void> {
    return new Promise((resolve, reject) => {
      sock.emit('room:join', roomId, playerName, (result) => {
        if (result.ok) resolve();
        else reject(new Error(result.error));
      });
    });
  }

  function listRooms(sock: TC): Promise<RoomSummary[]> {
    return new Promise((resolve) => {
      sock.emit('room:list', '', (rooms) => resolve(rooms));
    });
  }

  /** Wait one event-loop turn so queued socket.io frames flush in both directions. */
  function flush(ms = 50): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  it('emits room:left to the leaver, not to remaining players', async () => {
    const alice = await connect('alice');
    const bob = await connect('bob');

    const roomId = await createRoom(alice, 'Alice');
    await joinRoom(bob, roomId, 'Bob');
    await flush();

    const aliceLeft: boolean[] = [];
    const bobLeft: boolean[] = [];
    const bobStates: RoomState[] = [];
    alice.on('room:left', () => aliceLeft.push(true));
    bob.on('room:left', () => bobLeft.push(true));
    bob.on('room:state', (s) => bobStates.push(s));

    alice.emit('room:leave');
    await flush();

    expect(aliceLeft).toHaveLength(1);
    expect(bobLeft).toHaveLength(0);
    // Bob sees a state update showing Alice gone.
    const last = bobStates.at(-1);
    expect(last?.players.map((p) => p.id)).toEqual(['bob']);

    alice.disconnect();
    bob.disconnect();
  });

  it('removes the room immediately when the last player leaves', async () => {
    const alice = await connect('alice');
    const observer = await connect('observer');

    const roomId = await createRoom(alice, 'Alice');
    await flush();

    expect((await listRooms(observer)).some((r) => r.roomId === roomId)).toBe(true);
    expect(roomManager.getRoom(roomId)).toBeDefined();

    alice.emit('room:leave');
    await flush();

    expect(roomManager.getRoom(roomId)).toBeUndefined();
    expect((await listRooms(observer)).some((r) => r.roomId === roomId)).toBe(false);

    alice.disconnect();
    observer.disconnect();
  });

  it('keeps the room when a non-last player leaves', async () => {
    const alice = await connect('alice');
    const bob = await connect('bob');

    const roomId = await createRoom(alice, 'Alice');
    await joinRoom(bob, roomId, 'Bob');
    await flush();

    alice.emit('room:leave');
    await flush();

    const room = roomManager.getRoom(roomId);
    expect(room).toBeDefined();
    expect(room?.players.size).toBe(1);
    expect(room?.hostId).toBe('bob');

    alice.disconnect();
    bob.disconnect();
  });

  it('emits room:left to the kicked player and removes empty room', async () => {
    const alice = await connect('alice');
    const bob = await connect('bob');

    const roomId = await createRoom(alice, 'Alice');
    await joinRoom(bob, roomId, 'Bob');
    await flush();

    const bobLeft: boolean[] = [];
    const aliceLeft: boolean[] = [];
    bob.on('room:left', () => bobLeft.push(true));
    alice.on('room:left', () => aliceLeft.push(true));

    alice.emit('room:kick', 'bob');
    await flush();

    expect(bobLeft).toHaveLength(1);
    expect(aliceLeft).toHaveLength(0);
    // Room still exists with Alice
    expect(roomManager.getRoom(roomId)?.players.size).toBe(1);

    // Now Alice leaves — room should be cleaned up
    alice.emit('room:leave');
    await flush();
    expect(roomManager.getRoom(roomId)).toBeUndefined();

    alice.disconnect();
    bob.disconnect();
  });

  it('broadcasts rooms:updated to all sockets on leave', async () => {
    const alice = await connect('alice');
    const lobbyViewer = await connect('viewer');

    const updates: number[] = [];
    lobbyViewer.on('rooms:updated', () => updates.push(Date.now()));

    const roomId = await createRoom(alice, 'Alice');
    await flush();
    const createdCount = updates.length;
    expect(createdCount).toBeGreaterThanOrEqual(1);

    alice.emit('room:leave');
    await flush();
    expect(updates.length).toBeGreaterThan(createdCount);
    expect(roomManager.getRoom(roomId)).toBeUndefined();

    alice.disconnect();
    lobbyViewer.disconnect();
  });

  it('rejects game:action from a socket that is not a player in any room', async () => {
    const lonely = await connect('lonely');

    const rejection = new Promise<string>((resolve) => {
      lonely.once('game:reject', (reason: string) => resolve(reason));
    });
    lonely.emit('game:action', { type: 'noop' }, 0);
    const reason = await Promise.race([
      rejection,
      new Promise<string>((_, reject) =>
        setTimeout(() => reject(new Error('no game:reject received')), 1500),
      ),
    ]);
    expect(reason).toMatch(/not a player/i);

    lonely.disconnect();
  });

  it('rejects game:action emitted by a spectator socket (no player room)', async () => {
    const alice = await connect('alice');
    const bob = await connect('bob');
    const charlie = await connect('charlie');

    const roomId = await createRoom(alice, 'Alice');
    await joinRoom(bob, roomId, 'Bob');

    // Ready up + start so the room is actually spectate-able (spectate
    // refuses rooms still in 'waiting').
    alice.emit('room:ready');
    bob.emit('room:ready');
    await flush();
    await new Promise<void>((resolve, reject) => {
      alice.emit('room:start', (res) => (res.ok ? resolve() : reject(new Error(res.error))));
    });
    await flush();

    // Charlie spectates — never becomes a player.
    await new Promise<void>((resolve, reject) => {
      charlie.emit('room:spectate', roomId, (res) =>
        res.ok ? resolve() : reject(new Error(res.error)),
      );
    });

    const rejection = new Promise<string>((resolve) => {
      charlie.once('game:reject', (reason: string) => resolve(reason));
    });
    charlie.emit('game:action', { type: 'noop' }, 0);
    const reason = await Promise.race([
      rejection,
      new Promise<string>((_, reject) =>
        setTimeout(() => reject(new Error('spectator got no rejection')), 1500),
      ),
    ]);
    expect(reason).toMatch(/not a player/i);

    alice.disconnect();
    bob.disconnect();
    charlie.disconnect();
  });
});

describe('socket handlers: room:updateOptions', () => {
  let httpServer: ReturnType<typeof createServer>;
  let io: Server<ClientEvents, ServerEvents>;
  let roomManager: RoomManager;
  let port: number;

  beforeEach(async () => {
    httpServer = createServer();
    io = new Server<ClientEvents, ServerEvents>(httpServer);
    io.use((socket, next) => {
      const { userId, userName, isGuest } = socket.handshake.auth as {
        userId: string;
        userName?: string;
        isGuest?: boolean;
      };
      socket.data.userId = userId;
      socket.data.userName = userName ?? userId;
      socket.data.isGuest = isGuest ?? true;
      next();
    });

    roomManager = new RoomManager();
    setupHandlers(io, roomManager, { configurable: makeConfigurablePlugin('configurable') });

    await new Promise<void>((resolve) => httpServer.listen(0, () => resolve()));
    port = (httpServer.address() as AddressInfo).port;
  });

  afterEach(async () => {
    roomManager.destroy();
    io.close();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  function connect(userId: string, userName = userId): Promise<TC> {
    return new Promise((resolve, reject) => {
      const sock: TC = ioClient(`http://localhost:${port}`, {
        auth: { userId, userName, isGuest: true },
        transports: ['websocket'],
        reconnection: false,
        forceNew: true,
      });
      sock.on('connect', () => resolve(sock));
      sock.on('connect_error', reject);
    });
  }

  function createRoom(sock: TC, playerName: string, gameId = 'configurable'): Promise<string> {
    return new Promise((resolve, reject) => {
      // Pass an empty object so the configurable plugin's zod schema (with
      // per-field defaults) resolves to meta.defaultConfig. socket.io
      // serializes `undefined` to `null`, which fails the schema's
      // `z.object({...})` check — that's an unrelated existing edge-case.
      sock.emit('room:create', gameId, playerName, {}, (result) => {
        if (result.ok) resolve(result.data.roomId);
        else reject(new Error(result.error));
      });
    });
  }

  function joinRoom(sock: TC, roomId: string, playerName: string): Promise<void> {
    return new Promise((resolve, reject) => {
      sock.emit('room:join', roomId, playerName, (result) => {
        if (result.ok) resolve();
        else reject(new Error(result.error));
      });
    });
  }

  function flush(ms = 50): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function updateOptions(
    sock: TC,
    payload: { maxPlayers?: number; config?: Record<string, unknown> },
  ): Promise<Ack> {
    return new Promise((resolve) => {
      sock.emit('room:updateOptions', payload, (res) => resolve(res));
    });
  }

  it('rejects non-host', async () => {
    const alice = await connect('alice');
    const bob = await connect('bob');
    const roomId = await createRoom(alice, 'Alice');
    await joinRoom(bob, roomId, 'Bob');
    await flush();

    const res = await updateOptions(bob, { maxPlayers: 4 });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/host/i);

    alice.disconnect();
    bob.disconnect();
  });

  it('rejects updates while the game is in progress', async () => {
    const alice = await connect('alice');
    const bob = await connect('bob');
    const roomId = await createRoom(alice, 'Alice');
    await joinRoom(bob, roomId, 'Bob');
    alice.emit('room:ready');
    bob.emit('room:ready');
    await flush();
    await new Promise<void>((resolve, reject) => {
      alice.emit('room:start', (r) => (r.ok ? resolve() : reject(new Error(r.error))));
    });
    await flush();

    const res = await updateOptions(alice, { maxPlayers: 4 });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/started|progress/i);

    alice.disconnect();
    bob.disconnect();
  });

  it('rejects out-of-range maxPlayers', async () => {
    const alice = await connect('alice');
    const roomId = await createRoom(alice, 'Alice');
    await flush();
    expect(roomManager.getRoom(roomId)).toBeDefined();

    const tooHigh = await updateOptions(alice, { maxPlayers: 99 });
    expect(tooHigh.ok).toBe(false);

    const tooLow = await updateOptions(alice, { maxPlayers: 1 });
    expect(tooLow.ok).toBe(false);

    const notInt = await updateOptions(alice, { maxPlayers: 3.5 });
    expect(notInt.ok).toBe(false);

    alice.disconnect();
  });

  it('rejects maxPlayers below the current player count', async () => {
    const alice = await connect('alice');
    const bob = await connect('bob');
    const carol = await connect('carol');
    const roomId = await createRoom(alice, 'Alice');
    await joinRoom(bob, roomId, 'Bob');
    await joinRoom(carol, roomId, 'Carol');
    await flush();

    const res = await updateOptions(alice, { maxPlayers: 2 });
    expect(res.ok).toBe(false);

    alice.disconnect();
    bob.disconnect();
    carol.disconnect();
  });

  it('rejects invalid config (configSchema.safeParse fails)', async () => {
    const alice = await connect('alice');
    await createRoom(alice, 'Alice');
    await flush();

    const res = await updateOptions(alice, {
      config: { fastMode: 'not-a-boolean', rounds: 3 },
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/config/i);

    alice.disconnect();
  });

  it('applies a valid update and broadcasts room:updated to the room', async () => {
    const alice = await connect('alice');
    const bob = await connect('bob');
    const roomId = await createRoom(alice, 'Alice');
    await joinRoom(bob, roomId, 'Bob');
    await flush();

    const aliceUpdates: Array<{ maxPlayers: number; config: unknown }> = [];
    const bobUpdates: Array<{ maxPlayers: number; config: unknown }> = [];
    alice.on('room:updated', (p) => aliceUpdates.push(p));
    bob.on('room:updated', (p) => bobUpdates.push(p));

    const res = await updateOptions(alice, {
      maxPlayers: 5,
      config: { fastMode: true, rounds: 7 },
    });
    expect(res.ok).toBe(true);
    await flush();

    // Both sockets in the room receive the event.
    expect(aliceUpdates).toHaveLength(1);
    expect(bobUpdates).toHaveLength(1);
    expect(aliceUpdates[0]).toEqual({
      maxPlayers: 5,
      config: { fastMode: true, rounds: 7 },
    });

    // Authoritative server state is updated too.
    const room = roomManager.getRoom(roomId);
    expect(room?.maxPlayers).toBe(5);
    expect(room?.config).toEqual({ fastMode: true, rounds: 7 });

    alice.disconnect();
    bob.disconnect();
  });
});
