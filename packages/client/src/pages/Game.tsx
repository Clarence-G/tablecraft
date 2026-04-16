import type { RoomState } from '@repo/shared';
import { Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { clientRegistry } from '../../../../games/client-registry';
import type { useGame } from '../hooks/useGame';

type GameState = ReturnType<typeof useGame>;

interface GamePageProps {
  userId: string;
  room: RoomState | null;
  game: GameState;
  onReturnToRoom?: () => void;
  onReturnToLobby?: () => void;
}

function Loading() {
  const { t } = useTranslation('common');
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-muted-foreground">{t('game.loading')}</div>
    </div>
  );
}

export function Game({ userId, room, game, onReturnToRoom, onReturnToLobby }: GamePageProps) {
  const { t } = useTranslation('common');
  const { state, sendAction, lastReject, notifications } = game;

  if (!room || !state) return <Loading />;

  const plugin = clientRegistry[room.gameId];
  if (!plugin) return <div className="p-8">{t('game.unknownGame')}: {room.gameId}</div>;

  const Board = plugin.Board;

  return (
    <div className="min-h-screen">
      {lastReject && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-[#fde8e8] border-2 border-destructive rounded-[12px] px-4 py-2 text-destructive font-medium z-50 shadow-card-active">
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
          onReturnToRoom={onReturnToRoom}
          onReturnToLobby={onReturnToLobby}
        />
      </Suspense>
    </div>
  );
}
