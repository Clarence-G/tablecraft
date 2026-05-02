import { createHash } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db as defaultDb } from '../db/index.js';
import { botTokens } from '../db/schema.js';

export interface BotIdentity {
  userId: string;
  name: string;
}

export interface BotRow {
  userId: string;
  name: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
}

export class BotLimitError extends Error {
  constructor() {
    super('Bot limit reached: maximum 5 active bots per user');
    this.name = 'BotLimitError';
  }
}

type Db = typeof defaultDb;

function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function toBotRow(row: typeof botTokens.$inferSelect): BotRow {
  return {
    userId: row.userId,
    name: row.name,
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
    revokedAt: row.revokedAt,
  };
}

export class TokenStore {
  constructor(private db: Db = defaultDb) {}

  async generate(name: string): Promise<{ token: string; userId: string }> {
    const token = nanoid(32);
    const userId = `bot_${nanoid()}`;
    const tokenHash = sha256Hex(token);
    await this.db.insert(botTokens).values({ userId, name, tokenHash });
    return { token, userId };
  }

  async verify(token: string): Promise<BotIdentity | null> {
    const tokenHash = sha256Hex(token);
    const rows = await this.db
      .select()
      .from(botTokens)
      .where(and(eq(botTokens.tokenHash, tokenHash), isNull(botTokens.revokedAt)))
      .limit(1);
    if (rows.length === 0) return null;
    const row = rows[0];
    // Fire-and-forget last_used_at update; not awaited to avoid slowing request path
    this.db
      .update(botTokens)
      .set({ lastUsedAt: new Date() })
      .where(eq(botTokens.id, row.id))
      .catch(() => {
        /* best-effort */
      });
    return { userId: row.userId, name: row.name };
  }

  async revoke(token: string): Promise<boolean> {
    const tokenHash = sha256Hex(token);
    const result = await this.db
      .update(botTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(botTokens.tokenHash, tokenHash), isNull(botTokens.revokedAt)))
      .returning({ id: botTokens.id });
    return result.length > 0;
  }

  // Returns active (non-revoked) bots owned by a user.
  async listByOwner(ownerUserId: string): Promise<BotRow[]> {
    const rows = await this.db
      .select()
      .from(botTokens)
      .where(and(eq(botTokens.ownerUserId, ownerUserId), isNull(botTokens.revokedAt)));
    return rows.map(toBotRow);
  }

  // Creates a new bot tied to an owner. Throws BotLimitError if owner already has 5 active bots.
  async generateOwned(ownerUserId: string, name: string): Promise<{ token: string; userId: string }> {
    const existing = await this.db
      .select({ id: botTokens.id })
      .from(botTokens)
      .where(and(eq(botTokens.ownerUserId, ownerUserId), isNull(botTokens.revokedAt)));
    if (existing.length >= 5) throw new BotLimitError();

    const token = nanoid(32);
    const userId = `bot_${nanoid()}`;
    const tokenHash = sha256Hex(token);
    await this.db.insert(botTokens).values({ userId, name, tokenHash, ownerUserId });
    return { token, userId };
  }

  // Revokes a bot only if the caller owns it. Returns false if not found.
  // Throws Error('NOT_OWNER') if bot exists but belongs to a different user.
  async revokeOwned(ownerUserId: string, botUserId: string): Promise<boolean> {
    const rows = await this.db
      .select()
      .from(botTokens)
      .where(and(eq(botTokens.userId, botUserId), isNull(botTokens.revokedAt)))
      .limit(1);
    if (rows.length === 0) return false;
    if (rows[0].ownerUserId !== ownerUserId) throw Object.assign(new Error('NOT_OWNER'), { code: 'NOT_OWNER' });
    await this.db
      .update(botTokens)
      .set({ revokedAt: new Date() })
      .where(eq(botTokens.userId, botUserId));
    return true;
  }

  async getOwnerId(botUserId: string): Promise<string | null> {
    const rows = await this.db
      .select({ ownerUserId: botTokens.ownerUserId })
      .from(botTokens)
      .where(eq(botTokens.userId, botUserId))
      .limit(1);
    return rows[0]?.ownerUserId ?? null;
  }
}
