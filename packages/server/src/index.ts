import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ClientEvents, ServerEvents } from '@repo/shared';
import { toNodeHandler } from 'better-auth/node';
import cors from 'cors';
import express from 'express';
import { Server } from 'socket.io';
import { serverRegistry } from '../../../games/server-registry.js';
import { createApiRouter } from './api/router.js';
import { TokenStore } from './api/token-store.js';
import { initDb } from './db/index.js';
import { RoomManager } from './engine/RoomManager.js';
import { auth } from './lib/auth.js';
import { createSessionMiddleware } from './middleware/session.js';
import { setupAuth } from './socket/auth.js';
import { setupHandlers } from './socket/handlers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Init DB (runs drizzle migrations)
await initDb();

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
  console.log(`Bot token: ${defaultBot.token} (userId: ${defaultBot.userId})`);
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

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
