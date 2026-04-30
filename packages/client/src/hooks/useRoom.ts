import type { ClientEvents, RoomState, RoomSummary, ServerEvents } from '@repo/shared';
import { useCallback, useEffect, useState } from 'react';
import type { Socket } from 'socket.io-client';

type AppSocket = Socket<ServerEvents, ClientEvents>;

export function useRoom(socket: AppSocket | null) {
  const [room, setRoom] = useState<RoomState | null>(null);

  useEffect(() => {
    if (!socket) return;
    const onState = (r: RoomState) => setRoom(r);
    const onLeft = () => setRoom(null);
    socket.on('room:state', onState);
    socket.on('room:left', onLeft);
    return () => {
      socket.off('room:state', onState);
      socket.off('room:left', onLeft);
    };
  }, [socket]);

  const create = useCallback(
    (gameId: string, playerName: string, config?: unknown) => {
      return new Promise<{ roomId: string }>((resolve, reject) => {
        if (!socket || !socket.connected) {
          reject(new Error('Socket not connected'));
          return;
        }
        // socket.io ack timeout: if server doesn't respond in 10s, reject.
        socket.timeout(10000).emit('room:create', gameId, playerName, config, (timeoutErr, result) => {
          if (timeoutErr) {
            reject(new Error('Server did not respond. Please try again.'));
            return;
          }
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
        if (!socket || !socket.connected) {
          reject(new Error('Socket not connected'));
          return;
        }
        socket.timeout(10000).emit('room:join', roomId, playerName, (timeoutErr, result) => {
          if (timeoutErr) {
            reject(new Error('Server did not respond. Please try again.'));
            return;
          }
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

  const listRooms = useCallback(
    (gameId: string): Promise<RoomSummary[]> => {
      return new Promise((resolve) => {
        socket?.emit('room:list', gameId, (rooms) => {
          resolve(rooms);
        });
      });
    },
    [socket],
  );

  return { room, create, join, leave, ready, start, kick, restart, listRooms };
}
