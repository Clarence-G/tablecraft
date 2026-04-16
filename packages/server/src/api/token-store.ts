import { nanoid } from 'nanoid';

export interface BotIdentity {
  userId: string;
  name: string;
}

export class TokenStore {
  private tokens = new Map<string, BotIdentity>();

  generate(name: string): { token: string; userId: string } {
    const token = nanoid(32);
    const userId = `bot_${nanoid()}`;
    this.tokens.set(token, { userId, name });
    return { token, userId };
  }

  verify(token: string): BotIdentity | null {
    return this.tokens.get(token) ?? null;
  }

  revoke(token: string): boolean {
    return this.tokens.delete(token);
  }
}
