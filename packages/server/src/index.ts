import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ClientEvents, ServerEvents } from '@repo/shared';
import express from 'express';
import { Server } from 'socket.io';
import { serverRegistry } from '../../../games/server-registry.js';
import { createApiRouter } from './api/router.js';
import { TokenStore } from './api/token-store.js';
import { initDb } from './db/index.js';
import { RoomManager } from './engine/RoomManager.js';
import { setupAuth } from './socket/auth.js';
import { setupHandlers } from './socket/handlers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Init DB
initDb();

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

setupAuth(io);
setupHandlers(io, roomManager, serverRegistry);

// REST API for bots
app.use('/api', createApiRouter(roomManager, serverRegistry, tokenStore));

// Generate default bot token for development
const defaultBot = tokenStore.generate('DefaultBot');
console.log(`Bot token: ${defaultBot.token} (userId: ${defaultBot.userId})`);

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
