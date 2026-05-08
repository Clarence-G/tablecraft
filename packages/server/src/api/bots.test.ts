import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { toNodeHandler } from 'better-auth/node';
import express, { Router } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '../db/schema.js';
import { type TestDb, createTestDb } from '../db/testing.js';

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

describe('bots REST routes', () => {
  let db: TestDb['db'];
  let testDb: TestDb;
  let httpServer: ReturnType<typeof createServer>;
  let baseUrl: string;
  let registerBotsRoutes: typeof import('./bots.js').registerBotsRoutes;
  let TokenStore: typeof import('./token-store.js').TokenStore;

  beforeEach(async () => {
    testDb = await createTestDb();
    db = testDb.db;

    vi.resetModules();
    vi.doMock('../db/index.js', () => ({ db }));
    ({ registerBotsRoutes } = await import('./bots.js'));
    ({ TokenStore } = await import('./token-store.js'));
    const { createSessionMiddleware } = await import('../middleware/session.js');

    const auth = buildAuth(db);
    const tokenStore = new TokenStore(db);

    const app = express();
    app.all('/api/auth/*', toNodeHandler(auth));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    app.use('/api', createSessionMiddleware(auth as any, { dailyCheckin: false }));
    const router = Router();
    router.use(express.json());
    registerBotsRoutes(router, tokenStore);
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
      .map((c) => c.split(';')[0])
      .join('; ');
    return { cookie, userId: body.user.id as string };
  }

  it('GET /api/me/bots returns 401 without session', async () => {
    const resp = await fetch(`${baseUrl}/api/me/bots`);
    expect(resp.status).toBe(401);
    const body = await resp.json();
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('GET /api/me/bots returns empty list for new user', async () => {
    const { cookie } = await signUp('alice@example.com', 'correct-horse-battery-staple', 'Alice');
    const resp = await fetch(`${baseUrl}/api/me/bots`, { headers: { cookie } });
    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body.data.bots).toEqual([]);
    expect(body.data.remaining).toBe(5);
  });

  it('POST /api/me/bots creates a bot and returns token once', async () => {
    const { cookie } = await signUp('alice@example.com', 'correct-horse-battery-staple', 'Alice');
    const resp = await fetch(`${baseUrl}/api/me/bots`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ name: 'My Bot' }),
    });
    expect(resp.status).toBe(201);
    const body = await resp.json();
    expect(body.data.bot.userId).toMatch(/^bot_/);
    expect(body.data.bot.name).toBe('My Bot');
    expect(typeof body.data.token).toBe('string');
    expect(body.data.token.length).toBeGreaterThanOrEqual(20);
  });

  it('POST /api/me/bots returns 401 without session', async () => {
    const resp = await fetch(`${baseUrl}/api/me/bots`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Bot' }),
    });
    expect(resp.status).toBe(401);
  });

  it('POST /api/me/bots returns 400 on missing/too-long name', async () => {
    const { cookie } = await signUp('alice@example.com', 'correct-horse-battery-staple', 'Alice');

    const noName = await fetch(`${baseUrl}/api/me/bots`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({}),
    });
    expect(noName.status).toBe(400);
    expect((await noName.json()).error.code).toBe('INVALID_BODY');

    const tooLong = await fetch(`${baseUrl}/api/me/bots`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ name: 'x'.repeat(41) }),
    });
    expect(tooLong.status).toBe(400);
    expect((await tooLong.json()).error.code).toBe('INVALID_BODY');
  });

  it('POST /api/me/bots returns 409 when limit reached (5 bots)', async () => {
    const { cookie } = await signUp('alice@example.com', 'correct-horse-battery-staple', 'Alice');

    for (let i = 0; i < 5; i++) {
      const r = await fetch(`${baseUrl}/api/me/bots`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({ name: `Bot ${i}` }),
      });
      expect(r.status).toBe(201);
    }

    const sixth = await fetch(`${baseUrl}/api/me/bots`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ name: 'Bot 5' }),
    });
    expect(sixth.status).toBe(409);
    expect((await sixth.json()).error.code).toBe('BOT_LIMIT_REACHED');
  });

  it('DELETE /api/me/bots revoking one of 5 increases remaining to 1', async () => {
    const { cookie } = await signUp('alice@example.com', 'correct-horse-battery-staple', 'Alice');

    let botUserId = '';
    for (let i = 0; i < 5; i++) {
      const r = await fetch(`${baseUrl}/api/me/bots`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({ name: `Bot ${i}` }),
      });
      const b = await r.json();
      if (i === 0) botUserId = b.data.bot.userId;
    }

    // Revoke the first bot
    const del = await fetch(`${baseUrl}/api/me/bots/${botUserId}`, {
      method: 'DELETE',
      headers: { cookie },
    });
    expect(del.status).toBe(200);
    expect((await del.json()).data.revoked).toBe(true);

    // Now remaining = 1 (4 active, 1 slot freed)
    const list = await fetch(`${baseUrl}/api/me/bots`, { headers: { cookie } });
    const body = await list.json();
    expect(body.data.bots).toHaveLength(4);
    expect(body.data.remaining).toBe(1);
    // Revoked bot is not in the default list
    expect(body.data.bots.every((b: { userId: string }) => b.userId !== botUserId)).toBe(true);
  });

  it('DELETE /api/me/bots returns 403 NOT_OWNER when bot belongs to another user', async () => {
    const alice = await signUp('alice@example.com', 'correct-horse-battery-staple', 'Alice');
    const bob = await signUp('bob@example.com', 'correct-horse-battery-staple', 'Bob');

    // Alice creates a bot
    const create = await fetch(`${baseUrl}/api/me/bots`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: alice.cookie },
      body: JSON.stringify({ name: 'Alice Bot' }),
    });
    const {
      data: { bot },
    } = await create.json();

    // Bob tries to revoke Alice's bot
    const del = await fetch(`${baseUrl}/api/me/bots/${bot.userId}`, {
      method: 'DELETE',
      headers: { cookie: bob.cookie },
    });
    expect(del.status).toBe(403);
    expect((await del.json()).error.code).toBe('NOT_OWNER');
  });

  it('DELETE /api/me/bots returns 404 for unknown bot', async () => {
    const { cookie } = await signUp('alice@example.com', 'correct-horse-battery-staple', 'Alice');
    const del = await fetch(`${baseUrl}/api/me/bots/bot_doesnotexist`, {
      method: 'DELETE',
      headers: { cookie },
    });
    expect(del.status).toBe(404);
  });

  it('DELETE /api/me/bots returns 401 without session', async () => {
    const del = await fetch(`${baseUrl}/api/me/bots/bot_xxx`, { method: 'DELETE' });
    expect(del.status).toBe(401);
  });
});
