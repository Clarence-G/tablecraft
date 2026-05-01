import { GameLogProvider } from '@repo/game-ui/log';
import type { ClientEvents, RoomState, ServerEvents } from '@repo/shared';
import { Suspense, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Socket } from 'socket.io-client';
import { clientRegistry } from '../../../../games/client-registry';
import { GameRoomLayout } from '../components/layout/GameRoomLayout';

type AppSocket = Socket<ServerEvents, ClientEvents>;

interface SpectatorViewProps {
  socket: AppSocket | null;
  userId: string;
  roomId: string;
  onLeave: () => void;
}

function Loading() {
  const { t } = useTranslation('common');
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-muted-foreground">{t('game.loading')}</div>
    </div>
  );
}

export function SpectatorView({ socket, userId, roomId, onLeave }: SpectatorViewProps) {
  const { t } = useTranslation('common');
  const [gameState, setGameState] = useState<unknown>(null);
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!socket) return;

    socket.timeout(10000).emit('room:spectate', roomId, (timeoutErr, result) => {
      if (timeoutErr) {
        setError(t('room.connecting'));
        return;
      }
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setGameState(result.data.state);
    });

    const onSpectatorState = (state: unknown) => setGameState(state);
    const onRoomState = (state: RoomState) => setRoomState(state);

    socket.on('spectator:state', onSpectatorState);
    socket.on('room:state', onRoomState);

    return () => {
      socket.off('spectator:state', onSpectatorState);
      socket.off('room:state', onRoomState);
      socket.emit('room:unspectate');
    };
  }, [socket, roomId, t]);

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <div className="text-destructive font-medium">{error}</div>
        <button
          type="button"
          onClick={onLeave}
          className="inline-flex items-center gap-1 text-sm font-semibold border-2 border-border bg-card rounded-[10px] px-4 py-2 hover:border-foreground hover:-translate-y-0.5 transition-all"
        >
          {t('lobby.backToLobby')}
        </button>
      </div>
    );
  }

  if (!gameState || !roomState) return <Loading />;

  const plugin = clientRegistry[roomState.gameId];
  if (!plugin) {
    return (
      <div className="p-8">
        {t('game.unknownGame')}: {roomState.gameId}
      </div>
    );
  }

  const Board = plugin.Board;
  const meta = plugin.meta;
  const localizedName = t(`${roomState.gameId}:name`, { defaultValue: meta.name });
  const rulesText = t(`${roomState.gameId}:rules`, { defaultValue: '' });

  return (
    <GameLogProvider>
      <GameRoomLayout
        gameId={roomState.gameId}
        gameName={localizedName}
        icon={meta.icon}
        roomId={roomState.roomId}
        matchStartedAt={null}
        players={roomState.players}
        myId={userId}
        scene={meta.scene}
        rulesText={rulesText || undefined}
        onReturnToLobby={onLeave}
      >
        <Suspense fallback={<Loading />}>
          <Board
            state={gameState as never}
            myId={userId}
            players={roomState.players}
            sendAction={() => {}}
            isSending={false}
            lastReject={null}
            notifications={[]}
            isSpectator
          />
        </Suspense>
      </GameRoomLayout>
    </GameLogProvider>
  );
}
