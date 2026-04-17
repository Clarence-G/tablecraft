import { GameHeader } from '@repo/game-ui';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export interface GameRoomLayoutProps {
  gameId: string;
  gameName: string;
  icon?: string;
  roomId: string;
  /** Epoch ms when the match started; used to compute elapsed time. */
  matchStartedAt: number | null;
  phase?: string;
  onReturnToRoom?: () => void;
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

export function GameRoomLayout({
  gameName,
  icon,
  roomId,
  matchStartedAt,
  phase,
  onReturnToLobby,
  children,
}: GameRoomLayoutProps) {
  const { t } = useTranslation('game-ui');
  const elapsed = useElapsed(matchStartedAt);
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="min-h-screen flex flex-col">
      <GameHeader
        gameName={gameName}
        icon={icon}
        roomId={roomId}
        elapsedSeconds={elapsed}
        phase={phase}
        onBack={onReturnToLobby}
        onExit={() => setConfirming(true)}
      />
      <div className="flex-1 min-h-0 flex flex-col">{children}</div>

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
