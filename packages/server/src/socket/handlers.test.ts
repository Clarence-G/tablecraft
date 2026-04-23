import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type {
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
});
