import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { beforeEach, describe, expect, it } from 'vitest';
import * as schema from './schema';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = path.join(__dirname, '../../drizzle');

describe('db: PGlite + drizzle pg-core schema', () => {
  let db: ReturnType<typeof drizzle<typeof schema>>;

  beforeEach(async () => {
    const client = new PGlite();
    db = drizzle({ client, schema });
    await migrate(db, { migrationsFolder: MIGRATIONS });
  });

  it('round-trips a users row with id/name/createdAt', async () => {
    const createdAt = new Date('2026-04-22T00:00:00Z');
    await db.insert(schema.users).values({ id: 'u1', name: 'Alice', createdAt });

    const rows = await db.select().from(schema.users).where(eq(schema.users.id, 'u1'));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: 'u1', name: 'Alice' });
    expect(rows[0]?.createdAt).toBeInstanceOf(Date);
    expect(rows[0]?.createdAt.toISOString()).toBe(createdAt.toISOString());
  });

  it('auto-generates action_log.id via nanoid default', async () => {
    const now = new Date();
    await db.insert(schema.actionLog).values({
      roomId: 'r1',
      userId: 'u1',
      seq: 0,
      actionJson: '{"type":"tick"}',
      timestamp: now,
    });
    const rows = await db.select().from(schema.actionLog);
    expect(rows).toHaveLength(1);
    expect(typeof rows[0]?.id).toBe('string');
    expect(rows[0]?.id.length).toBeGreaterThan(0);
  });

  it('enforces unique (room_id, user_id, seq) on action_log', async () => {
    const now = new Date();
    await db.insert(schema.actionLog).values({
      roomId: 'r1',
      userId: 'u1',
      seq: 0,
      actionJson: '{}',
      timestamp: now,
    });
    await expect(
      db.insert(schema.actionLog).values({
        roomId: 'r1',
        userId: 'u1',
        seq: 0,
        actionJson: '{}',
        timestamp: now,
      }),
    ).rejects.toThrow();
  });
});
