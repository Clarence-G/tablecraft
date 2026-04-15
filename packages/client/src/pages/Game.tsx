import type { RoomState } from '@repo/shared';
import { Suspense } from 'react';
import { clientRegistry } from '../../../../games/client-registry';
import type { useGame } from '../hooks/useGame';

type GameState = ReturnType<typeof useGame>;

interface GamePageProps {
  userId: string;
  room: RoomState | null;
  game: GameState;
}

function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-muted-foreground">加载中...</div>
    </div>
  );
}

export function Game({ userId, room, game }: GamePageProps) {
  const { state, sendAction, lastReject, notifications } = game;

  if (!room || !state) return <Loading />;

  const plugin = clientRegistry[room.gameId];
  if (!plugin) return <div className="p-8">未知游戏: {room.gameId}</div>;

  const Board = plugin.Board;

  return (
    <div className="min-h-screen">
      {lastReject && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-destructive/15 border border-destructive/40 rounded-lg px-4 py-2 text-destructive z-50">
          {lastReject}
        </div>
      )}
      <Suspense fallback={<Loading />}>
        <Board
          state={state}
          myId={userId}
          players={room.players}
          sendAction={sendAction}
          lastReject={lastReject}
          notifications={notifications}
        />
      </Suspense>
    </div>
  );
}
