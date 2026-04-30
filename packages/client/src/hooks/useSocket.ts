import type { ClientEvents, ServerEvents } from '@repo/shared';
import { useEffect, useState } from 'react';
import { type Socket, io } from 'socket.io-client';

type AppSocket = Socket<ServerEvents, ClientEvents>;

type SocketAuth = {
  userId: string;
  userName: string;
  isGuest: boolean;
};

let socketInstance: AppSocket | null = null;

export function useSocket(userId: string, userName: string, isGuest = true) {
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!userId) return;

    if (!socketInstance) {
      const authBag: SocketAuth = { userId, userName, isGuest };
      socketInstance = io({
        auth: authBag,
        autoConnect: true,
        // Dev-friendly reconnection: short initial delay so `pnpm dev`
        // server restarts reconnect quickly, cap backoff at 2s so stale
        // tabs don't wait up to 5s (the socket.io default max).
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 300,
        reconnectionDelayMax: 2000,
        timeout: 10000,
      });
    } else {
      // If the auth identity changed (guest→user, user→guest, or user swap),
      // reconnect so the server middleware re-validates against the session
      // cookie with the new claim.
      const current = (socketInstance.auth ?? {}) as Partial<SocketAuth>;
      if (current.userId !== userId || current.isGuest !== isGuest) {
        socketInstance.auth = { userId, userName, isGuest } as SocketAuth;
        socketInstance.disconnect();
        socketInstance.connect();
      }
    }

    const socket = socketInstance;

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    if (socket.connected) setConnected(true);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, [userId, userName, isGuest]);

  // Keep socket auth in sync with current userName (for reconnections after rename)
  useEffect(() => {
    if (socketInstance) {
      socketInstance.auth = { ...(socketInstance.auth as SocketAuth), userName };
    }
  }, [userName]);

  return { socket: socketInstance, connected };
}
