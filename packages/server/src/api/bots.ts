import type { Request, Response, Router } from 'express';
import { BotLimitError, type TokenStore } from './token-store.js';

function sendError(res: Response, status: number, code: string, message: string): void {
  res.status(status).json({ ok: false, error: { code, message } });
}

export function registerBotsRoutes(router: Router, tokenStore: TokenStore): void {
  // GET /api/me/bots — list caller's active bots
  router.get('/me/bots', async (req: Request, res: Response) => {
    const session = req.session;
    if (!session) {
      sendError(res, 401, 'UNAUTHORIZED', 'Sign in to access this resource');
      return;
    }
    const bots = await tokenStore.listByOwner(session.user.id);
    const remaining = 5 - bots.length;
    res.json({ ok: true, data: { bots, remaining } });
  });

  // POST /api/me/bots — create a new bot owned by the caller
  router.post('/me/bots', async (req: Request, res: Response) => {
    const session = req.session;
    if (!session) {
      sendError(res, 401, 'UNAUTHORIZED', 'Sign in to access this resource');
      return;
    }
    const name = req.body?.name;
    if (!name || typeof name !== 'string' || name.trim().length === 0 || name.length > 40) {
      sendError(res, 400, 'INVALID_BODY', 'name is required and must be 1-40 characters');
      return;
    }
    try {
      const { token, userId } = await tokenStore.generateOwned(session.user.id, name.trim());
      const bots = await tokenStore.listByOwner(session.user.id);
      const bot = bots.find((b) => b.userId === userId);
      res.status(201).json({ ok: true, data: { bot, token } });
    } catch (err) {
      if (err instanceof BotLimitError) {
        sendError(res, 409, 'BOT_LIMIT_REACHED', 'Maximum 5 active bots per user');
        return;
      }
      throw err;
    }
  });

  // DELETE /api/me/bots/:botUserId — revoke a bot the caller owns
  router.delete('/me/bots/:botUserId', async (req: Request, res: Response) => {
    const session = req.session;
    if (!session) {
      sendError(res, 401, 'UNAUTHORIZED', 'Sign in to access this resource');
      return;
    }
    try {
      const found = await tokenStore.revokeOwned(session.user.id, req.params.botUserId);
      if (!found) {
        sendError(res, 404, 'NOT_FOUND', 'Bot not found or already revoked');
        return;
      }
      res.json({ ok: true, data: { revoked: true } });
    } catch (err) {
      if (err instanceof Error && (err as NodeJS.ErrnoException).code === 'NOT_OWNER') {
        sendError(res, 403, 'NOT_OWNER', 'This bot belongs to a different user');
        return;
      }
      throw err;
    }
  });
}
