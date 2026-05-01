import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { toNodeHandler } from 'better-auth/node';
import express, { Router } from 'express';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as schema from '../db/schema.js';
import { createTestDb, type TestDb } from '../db/testing.js';


function buildAuth(database: TestDb['db']) {
  return betterAuth({
    secret: 'test-secret-at-least-32-characters-long-xxxxxxxxxxxxxxxx',
    baseURL: 'http://localhost:0',
    database: drizzleAdapter(database, {
      provider: 'pg',
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
      },
    }),
    emailAndPassword: { enabled: true, requireEmailVerification: false },
  });
}

const mockRoomManager = {
  findRoomByUser: (_uid: string) => undefined,
} as unknown as import('../engine/RoomManager.js').RoomManager;

describe('friends REST routes', () => {
  let db: TestDb['db'];
  let testDb: TestDb;
  let httpServer: ReturnType<typeof createServer>;
  let baseUrl: string;
  let registerFriendsRoutes: typeof import('./friends.js').registerFriendsRoutes;

  beforeEach(async () => {
    testDb = await createTestDb();

    db = testDb.db;

    const { vi } = await import('vitest');
    vi.resetModules();
    vi.doMock('../db/index.js', () => ({ db }));
    ({ registerFriendsRoutes } = await import('./friends.js'));
    const { createSessionMiddleware } = await import('../middleware/session.js');

    const auth = buildAuth(db);
    const app = express();
    app.all('/api/auth/*', toNodeHandler(auth));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    app.use('/api', createSessionMiddleware(auth as any, { dailyCheckin: false }));
    const router = Router();
    router.use(express.json());
    registerFriendsRoutes(router, mockRoomManager);
    app.use('/api', router);

    httpServer = createServer(app);
    await new Promise<void>((resolve) => httpServer.listen(0, () => resolve()));
    const port = (httpServer.address() as AddressInfo).port;
    baseUrl = `http://localhost:${port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    await testDb.cleanup();
  });

  async function signUp(email: string, password: string, name: string) {
    const resp = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password, name }),
    });
    expect(resp.status).toBe(200);
    const body = await resp.json();
    const cookie = resp.headers
      .get('set-cookie')!
      .split(',')
      .map((c: string) => c.split(';')[0])
      .join('; ');
    return { cookie, userId: body.user.id as string };
  }

  // ---- Unauthenticated → 401 for all endpoints ----

  it('GET /api/friends returns 401 without session', async () => {
    const resp = await fetch(`${baseUrl}/api/friends`);
    expect(resp.status).toBe(401);
  });

  it('GET /api/friends/search returns 401 without session', async () => {
    const resp = await fetch(`${baseUrl}/api/friends/search?q=alice`);
    expect(resp.status).toBe(401);
  });

  it('POST /api/friends/request returns 401 without session', async () => {
    const resp = await fetch(`${baseUrl}/api/friends/request`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ targetUserId: 'someone' }),
    });
    expect(resp.status).toBe(401);
  });

  it('POST /api/friends/accept returns 401 without session', async () => {
    const resp = await fetch(`${baseUrl}/api/friends/accept`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId: 'someone' }),
    });
    expect(resp.status).toBe(401);
  });

  it('POST /api/friends/decline returns 401 without session', async () => {
    const resp = await fetch(`${baseUrl}/api/friends/decline`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId: 'someone' }),
    });
    expect(resp.status).toBe(401);
  });

  it('DELETE /api/friends/:userId returns 401 without session', async () => {
    const resp = await fetch(`${baseUrl}/api/friends/someone`, { method: 'DELETE' });
    expect(resp.status).toBe(401);
  });

  // ---- Request flow: request → pending → accept → accepted ----

  it('full request → accept flow shows pending then accepted', async () => {
    const alice = await signUp('alice@test.com', 'password123', 'Alice');
    const bob = await signUp('bob@test.com', 'password123', 'Bob');

    // Alice requests Bob
    const reqResp = await fetch(`${baseUrl}/api/friends/request`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: alice.cookie },
      body: JSON.stringify({ targetUserId: bob.userId }),
    });
    expect(reqResp.status).toBe(200);
    const reqBody = await reqResp.json();
    expect(reqBody.data.status).toBe('pending');

    // Bob sees pending incoming
    const bobList = await fetch(`${baseUrl}/api/friends`, { headers: { cookie: bob.cookie } });
    const bobData = (await bobList.json()).data;
    expect(bobData.pending.incoming).toHaveLength(1);
    expect(bobData.pending.incoming[0].userId).toBe(alice.userId);

    // Bob accepts
    const acceptResp = await fetch(`${baseUrl}/api/friends/accept`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: bob.cookie },
      body: JSON.stringify({ userId: alice.userId }),
    });
    expect(acceptResp.status).toBe(200);

    // Alice sees Bob as friend
    const aliceList = await fetch(`${baseUrl}/api/friends`, { headers: { cookie: alice.cookie } });
    const aliceData = (await aliceList.json()).data;
    expect(aliceData.friends).toHaveLength(1);
    expect(aliceData.friends[0].userId).toBe(bob.userId);
    expect(aliceData.pending.incoming).toHaveLength(0);

    // Bob sees Alice as friend
    const bobList2 = await fetch(`${baseUrl}/api/friends`, { headers: { cookie: bob.cookie } });
    const bobData2 = (await bobList2.json()).data;
    expect(bobData2.friends).toHaveLength(1);
    expect(bobData2.friends[0].userId).toBe(alice.userId);
  });

  // ---- Duplicate request is idempotent ----

  it('duplicate friend request returns 200 (idempotent)', async () => {
    const alice = await signUp('alice2@test.com', 'password123', 'Alice2');
    const bob = await signUp('bob2@test.com', 'password123', 'Bob2');

    const opts = {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: alice.cookie },
      body: JSON.stringify({ targetUserId: bob.userId }),
    };
    await fetch(`${baseUrl}/api/friends/request`, opts);
    const second = await fetch(`${baseUrl}/api/friends/request`, opts);
    expect(second.status).toBe(200);
    const body = await second.json();
    expect(body.data.status).toBe('pending');

    // Only one row in the DB
    const rows = await db.select().from(schema.friendships);
    expect(rows).toHaveLength(1);
  });

  // ---- Auto-accept when both parties request each other ----

  it('auto-accepts when the other party has already sent a request', async () => {
    const alice = await signUp('alice3@test.com', 'password123', 'Alice3');
    const bob = await signUp('bob3@test.com', 'password123', 'Bob3');

    // Bob requests Alice first
    await fetch(`${baseUrl}/api/friends/request`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: bob.cookie },
      body: JSON.stringify({ targetUserId: alice.userId }),
    });

    // Alice requests Bob → should auto-accept
    const autoResp = await fetch(`${baseUrl}/api/friends/request`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: alice.cookie },
      body: JSON.stringify({ targetUserId: bob.userId }),
    });
    expect(autoResp.status).toBe(200);
    const autoBody = await autoResp.json();
    expect(autoBody.data.status).toBe('accepted');

    // Both now see each other as friends
    const aliceList = await fetch(`${baseUrl}/api/friends`, { headers: { cookie: alice.cookie } });
    const aliceData = (await aliceList.json()).data;
    expect(aliceData.friends).toHaveLength(1);
  });

  // ---- Block relationship blocks request + hides in search ----

  it('block prevents friend request and hides user in search', async () => {
    const alice = await signUp('alice4@test.com', 'password123', 'Alice4');
    const bob = await signUp('bob4@test.com', 'password123', 'Bob4');

    // Alice blocks Bob
    await db.insert(schema.userBlocks).values({ blockerId: alice.userId, blockedId: bob.userId });

    // Bob tries to request Alice
    const reqResp = await fetch(`${baseUrl}/api/friends/request`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: bob.cookie },
      body: JSON.stringify({ targetUserId: alice.userId }),
    });
    expect(reqResp.status).toBe(400);
    const reqBody = await reqResp.json();
    expect(reqBody.error.code).toBe('BLOCKED');

    // Alice searches for Bob → not in results
    const searchResp = await fetch(`${baseUrl}/api/friends/search?q=Bob4`, {
      headers: { cookie: alice.cookie },
    });
    const searchData = (await searchResp.json()).data;
    expect(searchData.users).toHaveLength(0);
  });

  // ---- Search excludes self and accepted friends ----

  it('search excludes self and accepted friends, shows pending as relation', async () => {
    const alice = await signUp('alice5@test.com', 'password123', 'Alice5');
    const bob = await signUp('bob5@test.com', 'password123', 'Bob5');
    const carol = await signUp('carol5@test.com', 'password123', 'Carol5');

    // Make alice and carol accepted friends
    await fetch(`${baseUrl}/api/friends/request`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: alice.cookie },
      body: JSON.stringify({ targetUserId: carol.userId }),
    });
    await fetch(`${baseUrl}/api/friends/accept`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: carol.cookie },
      body: JSON.stringify({ userId: alice.userId }),
    });

    // Alice sends pending request to Bob
    await fetch(`${baseUrl}/api/friends/request`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: alice.cookie },
      body: JSON.stringify({ targetUserId: bob.userId }),
    });

    // Search for all (using "5" suffix which all share)
    const searchResp = await fetch(`${baseUrl}/api/friends/search?q=Bob5`, {
      headers: { cookie: alice.cookie },
    });
    const searchData = (await searchResp.json()).data;

    // Bob should appear with pending_out
    expect(searchData.users).toHaveLength(1);
    expect(searchData.users[0].userId).toBe(bob.userId);
    expect(searchData.users[0].relation).toBe('pending_out');
  });

  // ---- Decline flow ----

  it('decline removes pending incoming and returns 404 if no such request', async () => {
    const alice = await signUp('alice6@test.com', 'password123', 'Alice6');
    const bob = await signUp('bob6@test.com', 'password123', 'Bob6');

    // Alice requests Bob
    await fetch(`${baseUrl}/api/friends/request`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: alice.cookie },
      body: JSON.stringify({ targetUserId: bob.userId }),
    });

    // Bob declines
    const declineResp = await fetch(`${baseUrl}/api/friends/decline`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: bob.cookie },
      body: JSON.stringify({ userId: alice.userId }),
    });
    expect(declineResp.status).toBe(200);

    const rows = await db.select().from(schema.friendships);
    expect(rows).toHaveLength(0);

    // Second decline → 404
    const second = await fetch(`${baseUrl}/api/friends/decline`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: bob.cookie },
      body: JSON.stringify({ userId: alice.userId }),
    });
    expect(second.status).toBe(404);
  });

  // ---- Remove friendship (DELETE) ----

  it('DELETE removes accepted friendship and is idempotent', async () => {
    const alice = await signUp('alice7@test.com', 'password123', 'Alice7');
    const bob = await signUp('bob7@test.com', 'password123', 'Bob7');

    // Establish friendship
    await fetch(`${baseUrl}/api/friends/request`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: alice.cookie },
      body: JSON.stringify({ targetUserId: bob.userId }),
    });
    await fetch(`${baseUrl}/api/friends/accept`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: bob.cookie },
      body: JSON.stringify({ userId: alice.userId }),
    });

    // Alice removes Bob
    const delResp = await fetch(`${baseUrl}/api/friends/${bob.userId}`, {
      method: 'DELETE',
      headers: { cookie: alice.cookie },
    });
    expect(delResp.status).toBe(204);

    const rows = await db.select().from(schema.friendships);
    expect(rows).toHaveLength(0);

    // Bob can also delete (idempotent: already gone, still 204)
    const delResp2 = await fetch(`${baseUrl}/api/friends/${alice.userId}`, {
      method: 'DELETE',
      headers: { cookie: bob.cookie },
    });
    expect(delResp2.status).toBe(204);
  });

  // ---- 409 when requesting an already-accepted friend ----

  it('request to already-accepted friend returns 409', async () => {
    const alice = await signUp('alice8@test.com', 'password123', 'Alice8');
    const bob = await signUp('bob8@test.com', 'password123', 'Bob8');

    await fetch(`${baseUrl}/api/friends/request`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: alice.cookie },
      body: JSON.stringify({ targetUserId: bob.userId }),
    });
    await fetch(`${baseUrl}/api/friends/accept`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: bob.cookie },
      body: JSON.stringify({ userId: alice.userId }),
    });

    const reqAgain = await fetch(`${baseUrl}/api/friends/request`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: alice.cookie },
      body: JSON.stringify({ targetUserId: bob.userId }),
    });
    expect(reqAgain.status).toBe(409);
    expect((await reqAgain.json()).error.code).toBe('ALREADY_FRIENDS');
  });
});