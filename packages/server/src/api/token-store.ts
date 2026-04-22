import { createHash } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db as defaultDb } from '../db/index.js';
import { botTokens } from '../db/schema.js';

export interface BotIdentity {
  userId: string;
  name: string;
}

type Db = typeof defaultDb;

function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
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
}
