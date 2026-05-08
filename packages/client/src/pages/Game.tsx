import { GameLogProvider, useGameLog } from '@repo/game-ui/log';
import type { RoomState } from '@repo/shared';
import { Suspense, useEffect, useMemo } from 'react';
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
  /** Host-only restart of the just-finished match with the same players / options. */
  onReturnToRoom?: () => void;
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

/**
 * Outer guard: no hooks, only conditional branching. This lets us early-return
 * on null/missing state WITHOUT violating React Rules of Hooks (see skill
 * `react-early-return-hooks`). Before this split, the component called
 * `useMemo(playerNames)` AFTER two early `return`s, producing the classic
 * "Rendered more hooks than during the previous render" error once
 * room/view hydrated — which surfaced as codenames rendering
 * "Something went wrong" via the Sentry error boundary.
 */
export function Game(props: GamePageProps) {
  const { room, game } = props;

  if (!room || !game.view) return <Loading />;

  const plugin = clientRegistry[room.gameId];
  if (!plugin) return <UnknownGame gameId={room.gameId} />;

  return <GameInner {...props} room={room} plugin={plugin} />;
}

function UnknownGame({ gameId }: { gameId: string }) {
  const { t } = useTranslation('common');
  return (
    <div className="p-8">
      {t('game.unknownGame')}: {gameId}
    </div>
  );
}

type ClientPlugin = (typeof clientRegistry)[string];

interface GameInnerProps extends GamePageProps {
  room: RoomState;
  plugin: ClientPlugin;
}

function GameInner({
  userId,
  room,
  game,
  plugin,
  onReturnToLobby,
  onReturnToRoom,
}: GameInnerProps) {
  const { t } = useTranslation('common');
  const { view, sendAction, lastReject, notifications, matchStartedAt, isSending, gameOver } = game;

  const Board = plugin.Board;
  const meta = plugin.meta;
  const localizedName = t(`${room.gameId}:name`, { defaultValue: meta.name });
  // Per-game optional key: some games may not define `rules` in their i18n bundle.
  // Empty-string fallback (not a hardcoded UI string) — intentionally kept.
  const rulesText = t(`${room.gameId}:rules`, { defaultValue: '' });

  const playerNames = useMemo(
    () => Object.fromEntries(room.players.map((p) => [p.id, p.name])),
    [room.players],
  );

  return (
    <GameLogProvider defaultNs={room.gameId} playerNames={playerNames} players={room.players}>
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
            state={view!}
            myId={userId}
            players={room.players}
            sendAction={sendAction}
            isSending={isSending}
            lastReject={lastReject}
            notifications={notifications}
            pointsDelta={gameOver?.pointsDelta}
            onReturnToRoom={onReturnToRoom}
            onReturnToLobby={onReturnToLobby}
          />
        </Suspense>
      </GameRoomLayout>
    </GameLogProvider>
  );
}
