import type { IncomingHttpHeaders } from 'node:http';
import type { NextFunction, Request, Response } from 'express';
import type { Auth } from '../lib/auth.js';
import { ensureDailyCheckin } from '../lib/ledger.js';

export type Session = Awaited<ReturnType<Auth['api']['getSession']>>;

declare global {
  namespace Express {
    interface Request {
      session?: Session;
    }
  }
}

/**
 * Convert Node's plain-object headers (express `req.headers`) into a
 * web-standard Fetch `Headers` instance — BetterAuth's `getSession` requires
 * it so it can read the auth cookie.
 */
function toFetchHeaders(nodeHeaders: IncomingHttpHeaders): Headers {
  const h = new Headers();
  for (const [key, value] of Object.entries(nodeHeaders)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) h.append(key, v);
    } else {
      h.set(key, value);
    }
  }
  return h;
}

/**
 * Express middleware that attaches the BetterAuth session (or `undefined`)
 * to `req.session`. Never throws — a missing/invalid cookie produces
 * `req.session = undefined` so downstream routes can simply check the value.
 */
export interface SessionMiddlewareOptions {
  /** When true (default), the first authenticated request of the day inserts
   *  a `daily_checkin` ledger row. Tests should pass `false` to keep the
   *  ledger deterministic. */
  dailyCheckin?: boolean;
}

export function createSessionMiddleware(auth: Auth, options: SessionMiddlewareOptions = {}) {
  const dailyCheckin = options.dailyCheckin ?? true;
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const session = await auth.api.getSession({
        headers: toFetchHeaders(req.headers),
      });
      req.session = session ?? undefined;
      if (dailyCheckin && session?.user?.id) {
        void ensureDailyCheckin(session.user.id);
      }
    } catch {
      req.session = undefined;
    }
    next();
  };
}
