import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { Server } from 'socket.io';
import { type Socket, io as ioClient } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as schema from '../db/schema.js';
import { setupAuth } from './auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../drizzle');

describe('socket setupAuth', () => {
  let httpServer: ReturnType<typeof createServer>;
  let io: Server;
  let port: number;
  let auth: ReturnType<typeof buildAuth>;

  function buildAuth(database: ReturnType<typeof drizzle<typeof schema>>) {
    return betterAuth({
      secret: 'test-secret-at-least-32-characters-long-xxxxxxxxxxxxxxxx',
      baseURL: 'http://localhost:3001',
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
    const db = drizzle({ client, schema });
    await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
    auth = buildAuth(db);

    httpServer = createServer();
    io = new Server(httpServer);
    // The generic of the local `betterAuth` factory differs from the Auth
    // type in `lib/auth.ts` (stricter secret: string). They are structurally
    // compatible at runtime; the double-cast is required because TS views
    // the option bag as invariant.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setupAuth(io, auth as any);

    await new Promise<void>((resolve) => {
      httpServer.listen(0, () => resolve());
    });
    port = (httpServer.address() as AddressInfo).port;
  });

  afterEach(async () => {
    io.close();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  function connect(authData: Record<string, unknown>, cookieHeader?: string): Promise<Socket> {
    return new Promise((resolve, reject) => {
      const socket = ioClient(`http://localhost:${port}`, {
        auth: authData,
        extraHeaders: cookieHeader ? { cookie: cookieHeader } : {},
        transports: ['websocket'],
        reconnection: false,
        forceNew: true,
      });
      socket.on('connect', () => resolve(socket));
      socket.on('connect_error', (err) => reject(err));
    });
  }

  it('accepts guest (isGuest omitted defaults to guest)', async () => {
    const socket = await connect({ userId: 'guest_abc', userName: 'Panda' });
    expect(socket.connected).toBe(true);
    socket.disconnect();
  });

  it('accepts guest (isGuest: true explicit)', async () => {
    const socket = await connect({ userId: 'guest_abc', userName: 'Panda', isGuest: true });
    expect(socket.connected).toBe(true);
    socket.disconnect();
  });

  it('rejects missing userId', async () => {
    await expect(connect({ userName: 'X' })).rejects.toThrow(/missing userid/i);
  });

  it('rejects isGuest:false with no session cookie', async () => {
    await expect(
      connect({ userId: 'user_abc', userName: 'Alice', isGuest: false }),
    ).rejects.toThrow(/unauthorized/i);
  });

  it('rejects isGuest:false with session cookie for a different user', async () => {
    // Sign up a user and capture the session cookie from the response.
    const resp = await auth.api.signUpEmail({
      body: {
        email: 'alice@example.com',
        password: 'correct-horse-battery-staple',
        name: 'Alice',
      },
      asResponse: true,
    });
    const setCookie = resp.headers.get('set-cookie');
    expect(setCookie).toBeTruthy();
    // Turn set-cookie into a cookie header (take the first segment).
    const cookie = setCookie!.split(';')[0];

    await expect(
      connect({ userId: 'someone-else', userName: 'Alice', isGuest: false }, cookie),
    ).rejects.toThrow(/unauthorized/i);
  });

  it('accepts isGuest:false with a valid session cookie matching userId', async () => {
    const resp = await auth.api.signUpEmail({
      body: {
        email: 'bob@example.com',
        password: 'correct-horse-battery-staple',
        name: 'Bob',
      },
      asResponse: true,
    });
    const setCookie = resp.headers.get('set-cookie')!;
    const cookie = setCookie.split(';')[0];
    const body = await resp.json();
    const userId = body.user.id as string;

    const socket = await connect({ userId, userName: 'Bob', isGuest: false }, cookie);
    expect(socket.connected).toBe(true);
    socket.disconnect();
  });
});
