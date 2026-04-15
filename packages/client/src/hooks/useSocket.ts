import type { ClientEvents, ServerEvents } from '@repo/shared';
import { useEffect, useState } from 'react';
import { type Socket, io } from 'socket.io-client';

type AppSocket = Socket<ServerEvents, ClientEvents>;

let socketInstance: AppSocket | null = null;

export function useSocket(userId: string, userName: string) {
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!userId) return;

    if (!socketInstance) {
      socketInstance = io({
        auth: { userId, userName },
        autoConnect: true,
      });
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
  }, [userId, userName]);

  // Keep socket auth in sync with current userName (for reconnections after rename)
  useEffect(() => {
    if (socketInstance) {
      (socketInstance as any).auth = { ...(socketInstance as any).auth, userName };
    }
  }, [userName]);

  return { socket: socketInstance, connected };
}
