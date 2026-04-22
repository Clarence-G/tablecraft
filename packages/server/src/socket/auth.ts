import type { IncomingHttpHeaders } from 'node:http';
import type { ClientEvents, ServerEvents } from '@repo/shared';
import type { Server } from 'socket.io';
import type { Auth } from '../lib/auth.js';

/**
 * Convert Node header bag to a Fetch `Headers` instance so BetterAuth's
 * `getSession` can read the auth cookie. Mirror of the helper in
 * `middleware/session.ts`, kept local to avoid exporting an express-only
 * internal from the middleware module.
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
 * Socket.IO middleware. Handshake shape: `{ userId, userName, isGuest? }`.
 *
 * - Guest (default): stored as-is on `socket.data`.
 * - Non-guest (`isGuest: false`): the BetterAuth session cookie MUST be
 *   present, valid, and belong to the claimed `userId`. Otherwise the socket
 *   is rejected. We never silently downgrade to guest — that would let a
 *   caller impersonate a real user by passing their id with `isGuest: false`
 *   and no cookie.
 */
export function setupAuth(io: Server<ClientEvents, ServerEvents>, auth: Auth): void {
  io.use(async (socket, next) => {
    const userId = socket.handshake.auth.userId;
    const userName = socket.handshake.auth.userName;
    const isGuest = socket.handshake.auth.isGuest !== false; // default true

    if (!userId || typeof userId !== 'string') {
      return next(new Error('Missing userId'));
    }

    if (!isGuest) {
      try {
        const session = await auth.api.getSession({
          headers: toFetchHeaders(socket.handshake.headers),
        });
        if (!session || session.user.id !== userId) {
          return next(new Error('unauthorized'));
        }
      } catch {
        return next(new Error('unauthorized'));
      }
    }

    socket.data.userId = userId;
    socket.data.userName = userName ?? 'Anonymous';
    socket.data.isGuest = isGuest;
    next();
  });
}
