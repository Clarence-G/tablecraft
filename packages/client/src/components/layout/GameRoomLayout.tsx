import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { GameHeader, GameHeaderProvider, GameTable, useHeaderStatus } from '@repo/game-ui';
import { GameLogProvider } from '@repo/game-ui/log';
import { SidePanel } from '@repo/game-ui/side-panel';
import type { PlayerInfo, SurfaceKind } from '@repo/shared';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

export interface GameRoomLayoutProps {
  gameId: string;
  gameName: string;
  icon?: string;
  roomId: string;
  /** Epoch ms when the match started; used to compute elapsed time. */
  matchStartedAt: number | null;
  players?: PlayerInfo[];
  myId?: string;
  /** Visual surface for the Zone C play area. Defaults to 'marble'. */
  surface?: SurfaceKind;
  onReturnToLobby: () => void;
  children: React.ReactNode;
}

function useElapsed(startedAt: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  if (!startedAt) return 0;
  return Math.max(0, Math.floor((now - startedAt) / 1000));
}

function Inner({
  gameName,
  icon,
  roomId,
  matchStartedAt,
  players,
  myId,
  surface,
  onReturnToLobby,
  children,
}: Omit<GameRoomLayoutProps, 'gameId'>) {
  const { t } = useTranslation('game-ui');
  const elapsed = useElapsed(matchStartedAt);
  const [confirming, setConfirming] = useState(false);
  const { currentPlayerId, phase } = useHeaderStatus();

  return (
    <div className="min-h-screen flex flex-col">
      <GameHeader
        gameName={gameName}
        icon={icon}
        roomId={roomId}
        elapsedSeconds={elapsed}
        phase={phase}
        players={players}
        currentPlayerId={currentPlayerId}
        myId={myId}
        onBack={onReturnToLobby}
        onExit={() => setConfirming(true)}
      />
      <div className="flex-1 min-h-0 flex flex-row">
        <GameTable surface={surface}>{children}</GameTable>
        <SidePanel />
      </div>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t('header.exitConfirmTitle', { defaultValue: 'Leave the match?' })}
            </DialogTitle>
            <DialogDescription>
              {t('header.exitConfirmBody', {
                defaultValue: 'You can rejoin from the lobby if the room is still open.',
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(false)}>
              {t('header.exitConfirmCancel', { defaultValue: 'Stay' })}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setConfirming(false);
                onReturnToLobby();
              }}
            >
              {t('header.exitConfirmOk', { defaultValue: 'Leave' })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function GameRoomLayout(props: GameRoomLayoutProps) {
  return (
    <GameHeaderProvider>
      <GameLogProvider>
        <Inner {...props} />
      </GameLogProvider>
    </GameHeaderProvider>
  );
}
