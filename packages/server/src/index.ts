import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ClientEvents, ServerEvents } from '@repo/shared';
import express from 'express';
import { Server } from 'socket.io';
import { serverRegistry } from '../../../games/server-registry.js';
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

setupAuth(io);
setupHandlers(io, roomManager, serverRegistry);

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
