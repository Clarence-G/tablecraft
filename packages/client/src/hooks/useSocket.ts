import type { ClientEvents, ServerEvents } from '@repo/shared';
import { useEffect, useState } from 'react';
import { type Socket, io } from 'socket.io-client';

type AppSocket = Socket<ServerEvents, ClientEvents>;

let socketInstance: AppSocket | null = null;

export function useSocket(userId: string, userName: string, isGuest: boolean = true) {
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!userId) return;

    if (!socketInstance) {
      socketInstance = io({
        auth: { userId, userName, isGuest },
        autoConnect: true,
      });
    } else {
      // If the auth identity changed (guest→user, user→guest, or user swap),
      // reconnect so the server middleware re-validates against the session
      // cookie with the new claim.
      const current = (socketInstance as any).auth as {
        userId?: string;
        isGuest?: boolean;
      };
      if (current?.userId !== userId || current?.isGuest !== isGuest) {
        (socketInstance as any).auth = { userId, userName, isGuest };
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
      (socketInstance as any).auth = { ...(socketInstance as any).auth, userName };
    }
  }, [userName]);

  return { socket: socketInstance, connected };
}
