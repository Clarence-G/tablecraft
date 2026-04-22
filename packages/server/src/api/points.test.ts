import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { toNodeHandler } from 'better-auth/node';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import express from 'express';
import { Router } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '../db/schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../drizzle');

/**
 * End-to-end style: real HTTP server with BetterAuth mounted on /api/auth,
 * session middleware, and our points routes. Tests exercise the same wiring
 * `index.ts` uses.
 */
describe('points REST routes', () => {
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let httpServer: ReturnType<typeof createServer>;
  let baseUrl: string;
  let registerPointsRoutes: typeof import('./points.js').registerPointsRoutes;

  function buildAuth(database: ReturnType<typeof drizzle<typeof schema>>) {
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

  beforeEach(async () => {
    const client = new PGlite();
    db = drizzle({ client, schema });
    await migrate(db, { migrationsFolder: MIGRATIONS_DIR });

    // Mock the shared db so `points.ts` sees the per-test PGlite instance.
    vi.resetModules();
    vi.doMock('../db/index.js', () => ({ db }));
    ({ registerPointsRoutes } = await import('./points.js'));
    const { createSessionMiddleware } = await import('../middleware/session.js');

    const auth = buildAuth(db);

    const app = express();
    // BetterAuth catch-all must precede any body parser.
    app.all('/api/auth/*', toNodeHandler(auth));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    app.use('/api', createSessionMiddleware(auth as any, { dailyCheckin: false }));
    const router = Router();
    router.use(express.json());
    registerPointsRoutes(router);
    app.use('/api', router);

    httpServer = createServer(app);
    await new Promise<void>((resolve) => httpServer.listen(0, () => resolve()));
    const port = (httpServer.address() as AddressInfo).port;
    baseUrl = `http://localhost:${port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
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

  it('GET /api/me returns 401 without session', async () => {
    const resp = await fetch(`${baseUrl}/api/me`);
    expect(resp.status).toBe(401);
    const body = await resp.json();
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('GET /api/me returns user + zero points when signed in', async () => {
    const { cookie } = await signUp('alice@example.com', 'correct-horse-battery-staple', 'Alice');
    const resp = await fetch(`${baseUrl}/api/me`, { headers: { cookie } });
    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body.data.user.email).toBe('alice@example.com');
    expect(body.data.user.name).toBe('Alice');
    // claimedGuestId must NOT leak.
    expect(body.data.user).not.toHaveProperty('claimedGuestId');
    expect(body.data.user).not.toHaveProperty('emailVerified');
    expect(body.data.points).toEqual({ global: 0, byGame: {} });
    expect(body.data.recentGames).toEqual([]);
  });

  it('GET /api/me points aggregates by game', async () => {
    const { cookie, userId } = await signUp('a@e.com', 'correct-horse-battery-staple', 'A');
    await db.insert(schema.pointsLedger).values([
      { userId, guestId: null, gameId: 'gomoku', reason: 'win', points: 10 },
      { userId, guestId: null, gameId: 'gomoku', reason: 'win', points: 10 },
      { userId, guestId: null, gameId: 'uno', reason: 'draw', points: 3 },
    ]);
    const resp = await fetch(`${baseUrl}/api/me`, { headers: { cookie } });
    const body = await resp.json();
    expect(body.data.points.global).toBe(23);
    expect(body.data.points.byGame).toEqual({ gomoku: 20, uno: 3 });
  });

  it('GET /api/guest/:id/points returns zeros for unknown guest', async () => {
    const resp = await fetch(`${baseUrl}/api/guest/does-not-exist/points`);
    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body.data).toEqual({ global: 0, byGame: {} });
  });

  it('GET /api/guest/:id/points aggregates guest rows', async () => {
    await db.insert(schema.pointsLedger).values([
      { userId: null, guestId: 'guest_x', gameId: 'gomoku', reason: 'win', points: 10 },
      { userId: null, guestId: 'guest_x', gameId: 'uno', reason: 'draw', points: 3 },
    ]);
    const resp = await fetch(`${baseUrl}/api/guest/guest_x/points`);
    const body = await resp.json();
    expect(body.data.global).toBe(13);
    expect(body.data.byGame).toEqual({ gomoku: 10, uno: 3 });
  });

  it('POST /api/me/claim-guest merges ledger rows', async () => {
    // Seed guest rows, then sign up, then claim.
    await db.insert(schema.pointsLedger).values([
      { userId: null, guestId: 'guest_x', gameId: 'gomoku', reason: 'win', points: 10 },
      { userId: null, guestId: 'guest_x', gameId: 'uno', reason: 'draw', points: 3 },
    ]);
    const { cookie, userId } = await signUp('a@e.com', 'correct-horse-battery-staple', 'A');
    const resp = await fetch(`${baseUrl}/api/me/claim-guest`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ guestId: 'guest_x' }),
    });
    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body.data.mergedRows).toBe(2);

    const rows = await db.select().from(schema.pointsLedger);
    expect(rows.every((r) => r.userId === userId)).toBe(true);
    expect(rows.every((r) => r.guestId === null)).toBe(true);

    // User row carries the marker.
    const [updated] = await db
      .select()
      .from(schema.user)
      .where((await import('drizzle-orm')).eq(schema.user.id, userId));
    expect(updated.claimedGuestId).toBe('guest_x');
  });

  it('POST /api/me/claim-guest 409 when user already claimed', async () => {
    const { cookie } = await signUp('a@e.com', 'correct-horse-battery-staple', 'A');
    const first = await fetch(`${baseUrl}/api/me/claim-guest`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ guestId: 'guest_x' }),
    });
    expect(first.status).toBe(200);

    const second = await fetch(`${baseUrl}/api/me/claim-guest`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ guestId: 'guest_y' }),
    });
    expect(second.status).toBe(409);
    const body = await second.json();
    expect(body.error.code).toBe('ALREADY_CLAIMED');
  });

  it('POST /api/me/claim-guest 409 when guestId claimed by another user', async () => {
    const first = await signUp('a@e.com', 'correct-horse-battery-staple', 'A');
    await fetch(`${baseUrl}/api/me/claim-guest`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: first.cookie },
      body: JSON.stringify({ guestId: 'guest_x' }),
    });

    const second = await signUp('b@e.com', 'correct-horse-battery-staple', 'B');
    const resp = await fetch(`${baseUrl}/api/me/claim-guest`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: second.cookie },
      body: JSON.stringify({ guestId: 'guest_x' }),
    });
    expect(resp.status).toBe(409);
    const body = await resp.json();
    expect(body.error.code).toBe('GUEST_ALREADY_CLAIMED');
  });

  it('POST /api/me/claim-guest 401 without session', async () => {
    const resp = await fetch(`${baseUrl}/api/me/claim-guest`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ guestId: 'guest_x' }),
    });
    expect(resp.status).toBe(401);
  });

  it('POST /api/me/claim-guest 400 INVALID_BODY on empty / non-string guestId', async () => {
    const { cookie } = await signUp('a@e.com', 'correct-horse-battery-staple', 'A');
    // Empty body
    const empty = await fetch(`${baseUrl}/api/me/claim-guest`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({}),
    });
    expect(empty.status).toBe(400);
    expect((await empty.json()).error.code).toBe('INVALID_BODY');

    // Non-string guestId
    const numeric = await fetch(`${baseUrl}/api/me/claim-guest`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ guestId: 42 }),
    });
    expect(numeric.status).toBe(400);
    expect((await numeric.json()).error.code).toBe('INVALID_BODY');
  });

  it('POST /api/me/claim-guest races resolve to exactly one 200 + one 409', async () => {
    // Two distinct signed-in users racing on the same guestId. Pre-check
    // guards can both pass, so this exercises the catch-on-unique-violation
    // path in the handler's transaction.
    const a = await signUp('a@e.com', 'correct-horse-battery-staple', 'A');
    const b = await signUp('b@e.com', 'correct-horse-battery-staple', 'B');

    const fire = (cookie: string) =>
      fetch(`${baseUrl}/api/me/claim-guest`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({ guestId: 'guest_shared' }),
      });
    const [r1, r2] = await Promise.all([fire(a.cookie), fire(b.cookie)]);
    const statuses = [r1.status, r2.status].sort();
    expect(statuses).toEqual([200, 409]);
    const loser = r1.status === 409 ? r1 : r2;
    expect((await loser.json()).error.code).toBe('GUEST_ALREADY_CLAIMED');
  });

  it('GET /api/leaderboard returns top-N sorted desc', async () => {
    const a = await signUp('a@e.com', 'correct-horse-battery-staple', 'A');
    const b = await signUp('b@e.com', 'correct-horse-battery-staple', 'B');
    const c = await signUp('c@e.com', 'correct-horse-battery-staple', 'C');
    await db.insert(schema.pointsLedger).values([
      { userId: a.userId, gameId: 'g', reason: 'win', points: 50 },
      { userId: b.userId, gameId: 'g', reason: 'win', points: 30 },
      { userId: c.userId, gameId: 'g', reason: 'win', points: 10 },
      { userId: null, guestId: 'guest_x', gameId: 'g', reason: 'win', points: 9999 },
    ]);

    const resp = await fetch(`${baseUrl}/api/leaderboard`);
    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body.data.entries).toHaveLength(3);
    expect(body.data.entries[0]).toMatchObject({ rank: 1, userId: a.userId, points: 50 });
    expect(body.data.entries[1]).toMatchObject({ rank: 2, userId: b.userId, points: 30 });
    expect(body.data.entries[2]).toMatchObject({ rank: 3, userId: c.userId, points: 10 });
    expect(body.data.total).toBe(3);
    // Guest rows must not appear.
    expect(body.data.entries.some((e: { points: number }) => e.points === 9999)).toBe(false);
  });

  it('GET /api/leaderboard respects gameId filter', async () => {
    const a = await signUp('a@e.com', 'correct-horse-battery-staple', 'A');
    const b = await signUp('b@e.com', 'correct-horse-battery-staple', 'B');
    await db.insert(schema.pointsLedger).values([
      { userId: a.userId, gameId: 'gomoku', reason: 'win', points: 50 },
      { userId: b.userId, gameId: 'uno', reason: 'win', points: 30 },
    ]);
    const resp = await fetch(`${baseUrl}/api/leaderboard?gameId=gomoku`);
    const body = await resp.json();
    expect(body.data.entries).toHaveLength(1);
    expect(body.data.entries[0].userId).toBe(a.userId);
  });

  it('GET /api/leaderboard/me returns rank + total for session user', async () => {
    const a = await signUp('a@e.com', 'correct-horse-battery-staple', 'A');
    const b = await signUp('b@e.com', 'correct-horse-battery-staple', 'B');
    const c = await signUp('c@e.com', 'correct-horse-battery-staple', 'C');
    await db.insert(schema.pointsLedger).values([
      { userId: a.userId, gameId: 'g', reason: 'win', points: 50 },
      { userId: b.userId, gameId: 'g', reason: 'win', points: 30 },
      { userId: c.userId, gameId: 'g', reason: 'win', points: 10 },
    ]);

    const resp = await fetch(`${baseUrl}/api/leaderboard/me`, { headers: { cookie: b.cookie } });
    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body.data).toEqual({ rank: 2, points: 30, total: 3 });
  });

  it('GET /api/leaderboard/me returns null rank for zero-point user', async () => {
    const a = await signUp('a@e.com', 'correct-horse-battery-staple', 'A');
    const b = await signUp('b@e.com', 'correct-horse-battery-staple', 'B');
    await db
      .insert(schema.pointsLedger)
      .values([{ userId: a.userId, gameId: 'g', reason: 'win', points: 50 }]);

    const resp = await fetch(`${baseUrl}/api/leaderboard/me`, { headers: { cookie: b.cookie } });
    const body = await resp.json();
    expect(body.data.rank).toBeNull();
    expect(body.data.points).toBe(0);
    // total counts only scored users.
    expect(body.data.total).toBe(1);
  });
});
