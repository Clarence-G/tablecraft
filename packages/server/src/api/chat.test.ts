import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameRoom } from '../engine/GameRoom.js';
import { createTestDb, type TestDb } from '../db/testing.js';

describe('chat REST routes', () => {
  let testDb: TestDb;
  let httpServer: ReturnType<typeof createServer>;
  let baseUrl: string;
  let token: string;
  let userId: string;
  let roomId: string;
  let room: GameRoom;
  let emitted: Array<{ event: string; data: unknown }>;
  let mgr: { destroy: () => void; createRoom: (...a: any[]) => GameRoom; onPlayerJoin: (r: string, u: string) => void };
  let tokenStoreRef: { generate: (name: string) => Promise<{ token: string; userId: string }> };

  beforeEach(async () => {
    emitted = [];
    testDb = await createTestDb();

    vi.resetModules();
    vi.doMock('../db/index.js', () => ({ db: testDb.db }));

    const [{ createApiRouter }, { TokenStore }, { RoomManager }] = await Promise.all([
      import('./router.js'),
      import('./token-store.js'),
      import('../engine/RoomManager.js'),
    ]);

    tokenStoreRef = new TokenStore(testDb.db) as any;
    const generated = await tokenStoreRef.generate('TestBot');
    token = generated.token;
    userId = generated.userId;

    mgr = new RoomManager() as any;

    const mockIo = {
      to: (_rid: string) => ({
        emit: (ev: string, d: unknown) => emitted.push({ event: ev, data: d }),
      }),
      emit: vi.fn(),
    } as any;

    const fakeMeta = { id: 'test', maxPlayers: 4, defaultConfig: null };
    room = (mgr as any).createRoom('test', fakeMeta, {}, userId) as GameRoom;
    roomId = room.roomId;
    room.join(userId, 'TestBot', true);
    (mgr as any).onPlayerJoin(roomId, userId);

    const apiRouter = createApiRouter(mgr as any, {}, tokenStoreRef as any, mockIo);
    const app = express();
    app.use('/api', apiRouter);

    httpServer = createServer(app);
    await new Promise<void>((r) => httpServer.listen(0, () => r()));
    baseUrl = `http://localhost:${(httpServer.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    await new Promise<void>((r) => httpServer.close(() => r()));
    (mgr as any).destroy();
    await testDb.cleanup();
  });

  it('POST /chat happy path returns message and broadcasts on socket', async () => {
    const resp = await fetch(`${baseUrl}/api/rooms/${roomId}/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ text: 'hello world' }),
    });
    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body.ok).toBe(true);
    expect(body.data.text).toBe('hello world');
    expect(body.data.from).toBe(userId);
    expect(emitted).toHaveLength(1);
    expect(emitted[0].event).toBe('chat:message');
    expect((emitted[0].data as any).text).toBe('hello world');
  });

  it('POST /chat 6th send within a second returns 429 RATE_LIMITED', async () => {
    const chatUrl = `${baseUrl}/api/rooms/${roomId}/chat`;
    for (let i = 0; i < 5; i++) {
      const r = await fetch(chatUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ text: `msg ${i}` }),
      });
      expect(r.status).toBe(200);
    }
    const sixth = await fetch(chatUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ text: 'sixth' }),
    });
    expect(sixth.status).toBe(429);
    const body = await sixth.json();
    expect(body.error).toBe('RATE_LIMITED');
  });

  it('POST /chat empty text returns 400 INVALID_INPUT', async () => {
    const resp = await fetch(`${baseUrl}/api/rooms/${roomId}/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ text: '   ' }),
    });
    expect(resp.status).toBe(400);
    const body = await resp.json();
    expect(body.error).toBe('INVALID_INPUT');
  });

  it('POST /chat user not in room returns 403 NOT_A_PLAYER', async () => {
    const { token: t2 } = await tokenStoreRef.generate('OtherBot');
    const resp = await fetch(`${baseUrl}/api/rooms/${roomId}/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${t2}` },
      body: JSON.stringify({ text: 'hello' }),
    });
    expect(resp.status).toBe(403);
    const body = await resp.json();
    expect(body.error).toBe('NOT_A_PLAYER');
  });

  it('GET /chat?tail=5 returns last 5 messages in order', async () => {
    for (let i = 0; i < 8; i++) {
      room.appendChatMessage({
        id: `msg-${i}`,
        from: userId,
        fromName: 'TestBot',
        text: `msg-${i}`,
        at: 1000 + i * 100,
      });
    }
    const resp = await fetch(`${baseUrl}/api/rooms/${roomId}/chat?tail=5`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body.ok).toBe(true);
    expect(body.data.messages).toHaveLength(5);
    expect(body.data.messages[0].text).toBe('msg-3');
    expect(body.data.messages[4].text).toBe('msg-7');
  });

  it('GET /chat?after=<ts> returns only messages newer than timestamp', async () => {
    const baseTs = 1_000_000;
    for (let i = 0; i < 5; i++) {
      room.appendChatMessage({
        id: `msg-${i}`,
        from: userId,
        fromName: 'TestBot',
        text: `msg-${i}`,
        at: baseTs + i * 1000,
      });
    }
    const resp = await fetch(`${baseUrl}/api/rooms/${roomId}/chat?after=${baseTs + 2000}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body.data.messages).toHaveLength(2);
    expect(body.data.messages[0].text).toBe('msg-3');
    expect(body.data.messages[1].text).toBe('msg-4');
  });
});
