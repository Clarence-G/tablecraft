import type { RoomState } from '@repo/shared';
import { GameLogProvider, useGameLog } from '@repo/game-ui/log';
import { Suspense, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { clientRegistry } from '../../../../games/client-registry';
import { GameRoomLayout } from '../components/layout/GameRoomLayout';
import type { useGame } from '../hooks/useGame';

type GameState = ReturnType<typeof useGame>;

interface GamePageProps {
  userId: string;
  room: RoomState | null;
  game: GameState;
  onReturnToLobby: () => void;
}

function Loading() {
  const { t } = useTranslation('common');
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-muted-foreground">{t('game.loading')}</div>
    </div>
  );
}

/**
 * Bridges the `notifications` stream from useGame into the GameLogProvider
 * so <SidePanel/> can render the Activity Log. Must live inside the
 * <GameLogProvider>.
 */
function NotificationBridge({ notifications }: { notifications: unknown[] }) {
  const { ingestNotifications } = useGameLog();
  useEffect(() => {
    if (notifications.length === 0) return;
    ingestNotifications(notifications);
    // `ingestNotifications` dedupes by object identity via WeakSet, so
    // calling it with the full list on every update is safe and cheap.
  }, [notifications, ingestNotifications]);
  return null;
}

export function Game({ userId, room, game, onReturnToLobby }: GamePageProps) {
  const { t } = useTranslation('common');
  const { state, sendAction, lastReject, notifications, matchStartedAt, isSending } = game;

  if (!room || !state) return <Loading />;

  const plugin = clientRegistry[room.gameId];
  if (!plugin)
    return (
      <div className="p-8">
        {t('game.unknownGame')}: {room.gameId}
      </div>
    );

  const Board = plugin.Board;
  const meta = plugin.meta;
  const localizedName = t(`${room.gameId}:name`, { defaultValue: meta.name });
  // Per-game optional key: some games may not define `rules` in their i18n bundle.
  // Empty-string fallback (not a hardcoded UI string) — intentionally kept.
  const rulesText = t(`${room.gameId}:rules`, { defaultValue: '' });

  return (
    <GameLogProvider>
      <NotificationBridge notifications={notifications} />
      <GameRoomLayout
        gameId={room.gameId}
        gameName={localizedName}
        icon={meta.icon}
        roomId={room.roomId}
        matchStartedAt={matchStartedAt ?? null}
        players={room.players}
        myId={userId}
        scene={meta.scene}
        rulesText={rulesText || undefined}
        onReturnToLobby={onReturnToLobby}
      >
        {lastReject && (
          <div className="fixed top-16 left-1/2 -translate-x-1/2 bg-[#fde8e8] border-2 border-destructive rounded-[12px] px-4 py-2 text-destructive font-medium z-50 shadow-card-active">
            {lastReject}
          </div>
        )}
        <Suspense fallback={<Loading />}>
          <Board
            state={state}
            myId={userId}
            players={room.players}
            sendAction={sendAction}
            isSending={isSending}
            lastReject={lastReject}
            notifications={notifications}
          />
        </Suspense>
      </GameRoomLayout>
    </GameLogProvider>
  );
}
