import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  GameHeader,
  GameHeaderProvider,
  GameScene,
  GameTable,
  useHeaderStatus,
} from '@repo/game-ui';
import { SidePanel } from '@repo/game-ui/side-panel';
import type { GameScene as GameSceneConfig, PlayerInfo } from '@repo/shared';
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
  /** Optional per-game theming for the inner Play Surface. */
  scene?: GameSceneConfig;
  rulesText?: string;
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
  scene,
  rulesText,
  onReturnToLobby,
  children,
}: Omit<GameRoomLayoutProps, 'gameId'>) {
  const { t } = useTranslation('game-ui');
  const elapsed = useElapsed(matchStartedAt);
  const [confirming, setConfirming] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
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
        onRules={rulesText ? () => setRulesOpen(true) : undefined}
      />
      <div className="flex-1 min-h-0 flex flex-row">
        <GameTable>
          <GameScene scene={scene}>{children}</GameScene>
        </GameTable>
        <SidePanel />
      </div>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t('header.exitConfirmTitle')}
            </DialogTitle>
            <DialogDescription>
              {t('header.exitConfirmBody')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(false)}>
              {t('header.exitConfirmCancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setConfirming(false);
                onReturnToLobby();
              }}
            >
              {t('header.exitConfirmOk')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rulesOpen} onOpenChange={setRulesOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('header.rulesTitle')}</DialogTitle>
          </DialogHeader>
          <div className="whitespace-pre-wrap text-sm leading-relaxed">{rulesText}</div>
          <DialogFooter>
            <Button onClick={() => setRulesOpen(false)}>
              {t('header.rulesClose')}
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
      <Inner {...props} />
    </GameHeaderProvider>
  );
}
