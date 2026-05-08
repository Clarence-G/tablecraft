import { GameLogProvider } from '@repo/game-ui/log';
import type { ClientEvents, RoomState, ServerEvents } from '@repo/shared';
import { Eye } from 'lucide-react';
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
  const localizedName = t(`${roomState.gameId}:name`);
  const rulesText = t(`${roomState.gameId}:rules`);

  // Spectator is NOT a seated player. Point myId at the first seated player
  // so each game's Board renders a concrete player perspective rather than
  // falling back to setup/host UI. The outer pointer-events-none wrapper then
  // blocks any action attempts, and the server ignores actions from sockets
  // not in the room's player set anyway (defense in depth).
  const viewAsPlayerId = roomState.players[0]?.id ?? userId;

  return (
    <GameLogProvider defaultNs={roomState.gameId}>
      <GameRoomLayout
        gameId={roomState.gameId}
        gameName={localizedName}
        icon={meta.icon}
        roomId={roomState.roomId}
        matchStartedAt={null}
        players={roomState.players}
        myId={viewAsPlayerId}
        scene={meta.scene}
        rulesText={rulesText || undefined}
        onReturnToLobby={onLeave}
      >
        {/* Persistent top banner — high-contrast warning so spectator mode is unmistakable. */}
        <output
          aria-live="polite"
          className="sticky top-0 z-30 mb-3 flex items-center gap-2 rounded-[10px] border-2 border-foreground bg-warning px-4 py-2.5 text-sm font-bold text-foreground shadow-card"
        >
          <Eye className="size-5 shrink-0" />
          <span className="truncate">{t('spectator.banner')}</span>
        </output>
        {/* Read-only shell: blocks all click/drag interactions AND applies a
            visual downgrade so spectators never mistake the board for playable.
            - pointer-events-none: hard lock on all inputs
            - select-none: no text selection
            - opacity-70 + saturate-75: desaturated / dimmed so it reads as a
              passive viewing pane, not the active player surface */}
        <div
          className="pointer-events-none select-none opacity-55 saturate-50 contrast-90"
          aria-disabled="true"
          data-spectator="true"
        >
          <Suspense fallback={<Loading />}>
            <Board
              state={gameState as never}
              myId={viewAsPlayerId}
              players={roomState.players}
              sendAction={() => {}}
              isSending={false}
              lastReject={null}
              notifications={[]}
              isSpectator
            />
          </Suspense>
        </div>
      </GameRoomLayout>
    </GameLogProvider>
  );
}
