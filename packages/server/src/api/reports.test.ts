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
import express, { Router } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '../db/schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../drizzle');

describe('reports REST routes', () => {
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let httpServer: ReturnType<typeof createServer>;
  let baseUrl: string;
  let registerReportsRoutes: typeof import('./reports.js').registerReportsRoutes;

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

    vi.resetModules();
    vi.doMock('../db/index.js', () => ({ db }));
    ({ registerReportsRoutes } = await import('./reports.js'));
    const { createSessionMiddleware } = await import('../middleware/session.js');

    const auth = buildAuth(db);
    const app = express();
    app.all('/api/auth/*', toNodeHandler(auth));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    app.use('/api', createSessionMiddleware(auth as any, { dailyCheckin: false }));
    const router = Router();
    router.use(express.json());
    registerReportsRoutes(router);
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

  it('POST /api/reports returns 401 without session', async () => {
    const resp = await fetch(`${baseUrl}/api/reports`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ targetUserId: 'other', reason: 'spam' }),
    });
    expect(resp.status).toBe(401);
  });

  it('POST /api/reports with valid body inserts a row', async () => {
    const { cookie } = await signUp('alice@test.com', 'correct-horse-battery-staple', 'Alice');
    const resp = await fetch(`${baseUrl}/api/reports`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ targetUserId: 'other-user-id', reason: 'harassment', detail: 'said bad things' }),
    });
    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body.ok).toBe(true);
    expect(typeof body.data.id).toBe('string');

    const rows = await db.select().from(schema.reports);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.reason).toBe('harassment');
    expect(rows[0]?.detail).toBe('said bad things');
  });

  it('POST /api/reports self-report returns 400', async () => {
    const { cookie, userId } = await signUp('bob@test.com', 'correct-horse-battery-staple', 'Bob');
    const resp = await fetch(`${baseUrl}/api/reports`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ targetUserId: userId, reason: 'spam' }),
    });
    expect(resp.status).toBe(400);
    const body = await resp.json();
    expect(body.error.code).toBe('SELF_REPORT');
  });

  it('POST /api/reports 429 after 10 reports in an hour', async () => {
    const { cookie, userId } = await signUp('carol@test.com', 'correct-horse-battery-staple', 'Carol');
    // Insert 10 existing reports directly
    for (let i = 0; i < 10; i++) {
      await db.insert(schema.reports).values({
        reporterId: userId,
        targetUserId: `target-${i}`,
        reason: 'spam',
      });
    }
    const resp = await fetch(`${baseUrl}/api/reports`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ targetUserId: 'target-99', reason: 'spam' }),
    });
    expect(resp.status).toBe(429);
    const body = await resp.json();
    expect(body.error.code).toBe('TOO_MANY');
  });

  it('POST /api/reports/blocks inserts a block row', async () => {
    const { cookie } = await signUp('dave@test.com', 'correct-horse-battery-staple', 'Dave');
    const resp = await fetch(`${baseUrl}/api/reports/blocks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ targetUserId: 'blocked-user' }),
    });
    expect(resp.status).toBe(200);
    expect((await resp.json()).ok).toBe(true);

    const rows = await db.select().from(schema.userBlocks);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.blockedId).toBe('blocked-user');
  });

  it('POST /api/reports/blocks is idempotent', async () => {
    const { cookie } = await signUp('eve@test.com', 'correct-horse-battery-staple', 'Eve');
    const opts = {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ targetUserId: 'blocked-user' }),
    };
    await fetch(`${baseUrl}/api/reports/blocks`, opts);
    const resp2 = await fetch(`${baseUrl}/api/reports/blocks`, opts);
    expect(resp2.status).toBe(200);
    const rows = await db.select().from(schema.userBlocks);
    expect(rows).toHaveLength(1);
  });

  it('DELETE /api/reports/blocks/:id removes the block row', async () => {
    const { cookie, userId } = await signUp('frank@test.com', 'correct-horse-battery-staple', 'Frank');
    await db.insert(schema.userBlocks).values({ blockerId: userId, blockedId: 'to-unblock' });

    const resp = await fetch(`${baseUrl}/api/reports/blocks/to-unblock`, {
      method: 'DELETE',
      headers: { cookie },
    });
    expect(resp.status).toBe(200);
    const rows = await db.select().from(schema.userBlocks);
    expect(rows).toHaveLength(0);
  });

  it('GET /api/reports/blocks returns the blocklist', async () => {
    const { cookie, userId } = await signUp('grace@test.com', 'correct-horse-battery-staple', 'Grace');
    await db.insert(schema.userBlocks).values([
      { blockerId: userId, blockedId: 'user-a' },
      { blockerId: userId, blockedId: 'user-b' },
    ]);

    const resp = await fetch(`${baseUrl}/api/reports/blocks`, { headers: { cookie } });
    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body.ok).toBe(true);
    const ids = body.data.map((r: { userId: string }) => r.userId).sort();
    expect(ids).toEqual(['user-a', 'user-b']);
  });
});
