import type { NextFunction, Request, Response } from 'express';
import type { TokenStore } from './token-store.js';

declare global {
  namespace Express {
    interface Request {
      botUserId?: string;
      botUserName?: string;
    }
  }
}

export function createApiAuth(tokenStore: TokenStore) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      res.status(401).json({
        ok: false,
        error: 'INVALID_TOKEN',
        message: 'Missing or malformed Authorization header',
        hint: 'Use "Authorization: Bearer <token>" header',
      });
      return;
    }

    const token = header.slice(7);
    const identity = await tokenStore.verify(token);
    if (!identity) {
      res.status(401).json({
        ok: false,
        error: 'INVALID_TOKEN',
        message: 'Invalid or expired token',
        hint: 'Generate a new token via the server admin',
      });
      return;
    }

    req.botUserId = identity.userId;
    req.botUserName = identity.name;
    next();
  };
}
