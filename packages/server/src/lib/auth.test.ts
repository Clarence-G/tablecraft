import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '../db/schema.js';
import { type TestDb, createTestDb } from '../db/testing.js';
import type { EmailMessage, EmailTransport } from './email.js';

describe('BetterAuth integration', () => {
  let auth: ReturnType<typeof createTestAuth>;
  let db: TestDb['db'];
  let testDb: TestDb;

  function createTestAuth(database: TestDb['db'], transport?: EmailTransport) {
    const sendResetPassword = transport
      ? async ({
          user,
          url,
          token,
        }: { user: { email: string; name?: string | null }; url: string; token: string }) => {
          await transport.send({
            to: user.email,
            subject: 'TableCraft — Reset your password',
            text: `Hi ${user.name || ''},\n\nReset your password:\n${url}\n\nLink expires in 1 hour.`,
            html: `<p><a href="${url}">Reset</a></p>`,
          });
        }
      : undefined;

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
      emailAndPassword: {
        enabled: true,
        requireEmailVerification: false,
        ...(sendResetPassword && { sendResetPassword }),
      },
    });
  }

  beforeEach(async () => {
    testDb = await createTestDb();

    db = testDb.db;
    auth = createTestAuth(db);
  });

  afterEach(async () => {
    await testDb.cleanup();
  });

  it('signs up a new user via email + password and persists them', async () => {
    const result = await auth.api.signUpEmail({
      body: {
        email: 'alice@example.com',
        password: 'correct-horse-battery-staple',
        name: 'Alice',
      },
    });

    expect(result).toBeDefined();
    expect(result.user.email).toBe('alice@example.com');

    const users = await db.select().from(schema.user);
    expect(users).toHaveLength(1);
    expect(users[0].email).toBe('alice@example.com');
    expect(users[0].name).toBe('Alice');
    // claimed_guest_id extension column exists and defaults to null.
    expect(users[0].claimedGuestId).toBeNull();

    // Password is stored hashed on the `account` row, not on the user.
    const accounts = await db.select().from(schema.account);
    expect(accounts).toHaveLength(1);
    expect(accounts[0].providerId).toBe('credential');
    expect(accounts[0].password).toBeTruthy();
    expect(accounts[0].password).not.toBe('correct-horse-battery-staple');
  });

  it('rejects sign-in with the wrong password', async () => {
    await auth.api.signUpEmail({
      body: {
        email: 'bob@example.com',
        password: 'correctpassword123',
        name: 'Bob',
      },
    });

    await expect(
      auth.api.signInEmail({
        body: { email: 'bob@example.com', password: 'wrongpassword' },
      }),
    ).rejects.toThrow();
  });

  it('invokes sendResetPassword hook with user email, url, and token', async () => {
    const sendMock = vi.fn(async (_msg: EmailMessage) => {});
    const transport: EmailTransport = { send: sendMock };
    const authWithEmail = createTestAuth(db, transport);

    await authWithEmail.api.signUpEmail({
      body: { email: 'carol@example.com', password: 'password1234', name: 'Carol' },
    });

    await authWithEmail.api.requestPasswordReset({
      body: { email: 'carol@example.com', redirectTo: 'http://localhost:5173/reset-password' },
    });

    expect(sendMock).toHaveBeenCalledOnce();
    const msg = sendMock.mock.calls[0][0];
    expect(msg.to).toBe('carol@example.com');
    expect(msg.subject).toBe('TableCraft — Reset your password');
    expect(msg.text).toContain('http://');
  });

  it('does not call transport when reset is requested for unknown email', async () => {
    const sendMock = vi.fn(async (_msg: EmailMessage) => {});
    const transport: EmailTransport = { send: sendMock };
    const authWithEmail = createTestAuth(db, transport);

    // better-auth silently ignores resets for unknown emails (security)
    await authWithEmail.api.requestPasswordReset({
      body: { email: 'nobody@example.com', redirectTo: 'http://localhost:5173/reset-password' },
    });

    expect(sendMock).not.toHaveBeenCalled();
  });
});
