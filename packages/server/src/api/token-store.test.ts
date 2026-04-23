import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { beforeEach, describe, expect, it } from 'vitest';
import * as schema from '../db/schema.js';
import { TokenStore } from './token-store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = path.resolve(__dirname, '../../drizzle');

describe('TokenStore', () => {
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let tokenStore: TokenStore;

  beforeEach(async () => {
    const client = new PGlite();
    db = drizzle({ client, schema });
    await migrate(db, { migrationsFolder: MIGRATIONS });
    tokenStore = new TokenStore(db);
  });

  it('generate returns plaintext token and userId', async () => {
    const { token, userId } = await tokenStore.generate('Alice');
    expect(token).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(userId).toMatch(/^bot_/);
  });

  it('verify returns identity for valid token', async () => {
    const { token, userId } = await tokenStore.generate('Alice');
    const identity = await tokenStore.verify(token);
    expect(identity).toEqual({ userId, name: 'Alice' });
  });

  it('verify returns null for unknown token', async () => {
    const identity = await tokenStore.verify('nonexistent-token-abcdef1234567890abcd');
    expect(identity).toBeNull();
  });

  it('token survives TokenStore instance recreation (persistence)', async () => {
    const { token, userId } = await tokenStore.generate('Alice');
    const newStore = new TokenStore(db);
    const identity = await newStore.verify(token);
    expect(identity).toEqual({ userId, name: 'Alice' });
  });

  it('stores sha256(token) not plaintext in DB', async () => {
    const { token } = await tokenStore.generate('Alice');
    const rows = await db.select().from(schema.botTokens);
    expect(rows).toHaveLength(1);
    expect(rows[0].tokenHash).not.toBe(token);
    expect(rows[0].tokenHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('revoke makes verify return null', async () => {
    const { token } = await tokenStore.generate('Alice');
    const ok = await tokenStore.revoke(token);
    expect(ok).toBe(true);
    expect(await tokenStore.verify(token)).toBeNull();
  });

  it('revoke on unknown token returns false', async () => {
    const ok = await tokenStore.revoke('nonexistent-token-abcdef1234567890abcd');
    expect(ok).toBe(false);
  });

  it('revoke is idempotent (second revoke returns false)', async () => {
    const { token } = await tokenStore.generate('Alice');
    expect(await tokenStore.revoke(token)).toBe(true);
    expect(await tokenStore.revoke(token)).toBe(false);
  });

  it('verify updates lastUsedAt', async () => {
    const { token } = await tokenStore.generate('Alice');
    await tokenStore.verify(token);
    // Small delay to let fire-and-forget update settle
    await new Promise((r) => setTimeout(r, 50));
    const rows = await db.select().from(schema.botTokens);
    expect(rows[0].lastUsedAt).not.toBeNull();
  });
});
