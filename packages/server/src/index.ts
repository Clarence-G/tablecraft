import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ClientEvents, ServerEvents } from '@repo/shared';
import { toNodeHandler } from 'better-auth/node';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { Server } from 'socket.io';
import { serverRegistry } from '../../../games/server-registry.js';
import { createApiRouter } from './api/router.js';
import { TokenStore } from './api/token-store.js';
import { closeDb, initDb } from './db/index.js';
import { RoomManager } from './engine/RoomManager.js';
import { auth } from './lib/auth.js';
import { logger } from './lib/logger.js';
import { createSessionMiddleware } from './middleware/session.js';
import { setupAuth } from './socket/auth.js';
import { setupHandlers } from './socket/handlers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  // Init DB (runs drizzle migrations). If this throws, exit with a clear
  // message — tsx watch will restart us after the next file change.
  try {
    await initDb();
  } catch (err) {
    logger.fatal({ mod: 'server', err }, '[fatal] Database initialization failed');
    logger.fatal(
      { mod: 'server' },
      'If this is pglite WASM abort, check Node version (<25) and ' +
        '`packages/server/data/pgdata/` integrity. The server did NOT start.',
    );
    process.exit(1);
  }

  const app = express();
  const httpServer = createServer(app);

  const io = new Server<ClientEvents, ServerEvents>(httpServer, {
    cors: {
      origin: process.env.NODE_ENV === 'production' ? false : 'http://localhost:5173',
      credentials: true,
    },
  });

  const roomManager = new RoomManager();
  const tokenStore = new TokenStore();

  setupAuth(io, auth);
  setupHandlers(io, roomManager, serverRegistry);

  // Express CORS — must accept credentials so the auth cookie flows from Vite dev.
  if (process.env.NODE_ENV !== 'production') {
    app.use(cors({ origin: ['http://localhost:5173'], credentials: true }));
  }

  // Security headers. contentSecurityPolicy disabled because our SPA assets
  // and Vite dev server don't align with the default CSP; we rely on origin
  // checks for API and CORS for cross-origin.
  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }));

  // General API rate limit: 300 req/min per IP. Skip health check.
  const apiLimiter = rateLimit({
    windowMs: 60_000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.path === '/api/health',
  });
  app.use('/api', apiLimiter);

  // Liveness/readiness probe. Kept above BetterAuth so it's reachable even if
  // auth middleware is broken. Used by dev tooling, CI smoke tests, and
  // (future) container orchestrators.
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, uptime: process.uptime() });
  });

  // BetterAuth catch-all. Must come BEFORE express.json() — BetterAuth parses
  // the body itself (see https://better-auth.com/docs/integrations/express).
  app.all('/api/auth/*', toNodeHandler(auth));

  // Session middleware runs for all /api/* routes after the auth handler.
  // It attaches `req.session` (or undefined) so REST endpoints in future stages
  // can branch on logged-in vs. anonymous callers. Existing bot-token routes
  // ignore this and keep using their bearer middleware.
  app.use('/api', createSessionMiddleware(auth));

  // REST API (bots + humans). `createApiRouter` installs its own `express.json`
  // internally, which is safe because the BetterAuth handler already ran.
  app.use('/api', createApiRouter(roomManager, serverRegistry, tokenStore));

  // Dev-only: gated to skip in production to avoid leaking plaintext tokens to
  // prod logs and accumulating stale rows across restarts.
  if (process.env.NODE_ENV !== 'production') {
    const defaultBot = await tokenStore.generate('DefaultBot');
    logger.info({ mod: 'server', userId: defaultBot.userId }, `Bot token: ${defaultBot.token}`);
  }

  // Serve static in production
  if (process.env.NODE_ENV === 'production') {
    const clientDist = path.join(__dirname, '../../client/dist');
    app.use(express.static(clientDist));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  const PORT = process.env.PORT ? Number.parseInt(process.env.PORT) : 3001;

  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(PORT, () => {
      logger.info({ mod: 'server' }, `Server running on port ${PORT}`);
      resolve();
    });
  });

  // Graceful shutdown. Without this, SIGKILL / unhandled SIGTERM can leave
  // pglite's dataDir mid-write, corrupting it so the next boot has to rotate.
  let shuttingDown = false;
  async function shutdown(signal: string) {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ mod: 'server', signal }, '[shutdown] Received signal, closing server...');
    const timeout = setTimeout(() => {
      logger.error({ mod: 'server' }, '[shutdown] forced exit after 5s timeout');
      process.exit(1);
    }, 5000);
    try {
      io.close();
      await new Promise<void>((res) => httpServer.close(() => res()));
      await closeDb();
      clearTimeout(timeout);
      logger.info({ mod: 'server' }, '[shutdown] clean exit');
      process.exit(0);
    } catch (err) {
      logger.error({ mod: 'server', err }, '[shutdown] error during shutdown');
      clearTimeout(timeout);
      process.exit(1);
    }
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.fatal({ mod: 'server', err }, '[fatal] server crashed');
  process.exit(1);
});
