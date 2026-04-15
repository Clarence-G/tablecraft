import type { ClientEvents, ServerEvents } from '@repo/shared';
import type { Server } from 'socket.io';

export function setupAuth(io: Server<ClientEvents, ServerEvents>): void {
  io.use((socket, next) => {
    const userId = socket.handshake.auth.userId;
    const userName = socket.handshake.auth.userName;

    if (!userId || typeof userId !== 'string') {
      return next(new Error('Missing userId'));
    }

    socket.data.userId = userId;
    socket.data.userName = userName ?? 'Anonymous';
    next();
  });
}
