import type { ClientEvents, RoomState, ServerEvents } from '@repo/shared';
import { useCallback, useEffect, useState } from 'react';
import type { Socket } from 'socket.io-client';

type AppSocket = Socket<ServerEvents, ClientEvents>;

export function useRoom(socket: AppSocket | null) {
  const [room, setRoom] = useState<RoomState | null>(null);

  useEffect(() => {
    if (!socket) return;
    const handler = (r: RoomState) => setRoom(r);
    socket.on('room:state', handler);
    return () => {
      socket.off('room:state', handler);
    };
  }, [socket]);

  const create = useCallback(
    (gameId: string, playerName: string, config?: unknown) => {
      return new Promise<{ roomId: string }>((resolve, reject) => {
        socket?.emit('room:create', gameId, playerName, config, (result) => {
          if (result.ok) resolve(result.data);
          else reject(new Error(result.error));
        });
      });
    },
    [socket],
  );

  const join = useCallback(
    (roomId: string, playerName: string) => {
      return new Promise<void>((resolve, reject) => {
        socket?.emit('room:join', roomId, playerName, (result) => {
          if (result.ok) resolve();
          else reject(new Error(result.error));
        });
      });
    },
    [socket],
  );

  const leave = useCallback(() => socket?.emit('room:leave'), [socket]);
  const ready = useCallback(() => socket?.emit('room:ready'), [socket]);

  const start = useCallback(() => {
    return new Promise<void>((resolve, reject) => {
      socket?.emit('room:start', (result) => {
        if (result.ok) resolve();
        else reject(new Error(result.error));
      });
    });
  }, [socket]);

  const kick = useCallback((playerId: string) => socket?.emit('room:kick', playerId), [socket]);
  const restart = useCallback(() => socket?.emit('room:restart'), [socket]);

  return { room, create, join, leave, ready, start, kick, restart };
}
