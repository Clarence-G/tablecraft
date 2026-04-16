import { ArrowLeft, Frown, Home, Trophy } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface GameOverModalProps {
  rankings: string[];
  playerNames: Record<string, string>;
  myId: string;
  onRestart?: () => void;
  onReturnToRoom?: () => void;
  onReturnToLobby?: () => void;
}

export function GameOverModal({
  rankings,
  playerNames,
  myId,
  onRestart,
  onReturnToRoom,
  onReturnToLobby,
}: GameOverModalProps) {
  const myRank = rankings.indexOf(myId) + 1;
  const won = myRank === 1;
  const { t } = useTranslation('game-ui');

  return (
    <div
      className="fixed inset-0 bg-[#1a1108]/50 flex items-center justify-center z-50"
      data-testid="game-over-modal"
    >
      <div className="bg-card border-thick border-foreground rounded-[16px] p-8 max-w-sm w-full mx-4 text-center shadow-card">
        <div className="flex justify-center mb-2">
          {won ? (
            <Trophy className="size-10 text-warning" />
          ) : (
            <Frown className="size-10 text-muted-foreground" />
          )}
        </div>
        <h2 className="text-2xl font-bold mb-1 text-[#1a1108]">
          {won ? t('youWin') : t('rank', { rank: myRank })}
        </h2>

        <div className="my-4 space-y-2">
          {rankings.map((pid, i) => (
            <div
              key={pid}
              className={`flex items-center gap-2 px-3 py-2 rounded-[8px] border-2
              ${i === 0 ? 'bg-[#fef3e0] text-[#7a4006] border-warning' : 'bg-secondary text-muted-foreground border-border'}
            `}
            >
              <span className="font-bold font-mono w-6">{i + 1}.</span>
              <span className="font-medium">{playerNames[pid] ?? pid}</span>
              {pid === myId && (
                <span className="text-xs text-muted-foreground ml-auto">{t('you')}</span>
              )}
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-2 mt-4">
          {onRestart && (
            <button
              type="button"
              onClick={onRestart}
              data-testid="restart-btn"
              className="w-full bg-primary text-primary-foreground border-2 border-[#1a1108] py-2 rounded-[12px] font-semibold shadow-button transition-all hover:-translate-y-0.5 hover:shadow-button-hover active:translate-y-px active:shadow-button-active"
            >
              {t('playAgain')}
            </button>
          )}
          {onReturnToRoom && (
            <button
              type="button"
              onClick={onReturnToRoom}
              className="w-full bg-primary text-primary-foreground border-2 border-[#1a1108] py-2 rounded-[12px] font-semibold shadow-button transition-all hover:-translate-y-0.5 hover:shadow-button-hover active:translate-y-px active:shadow-button-active flex items-center justify-center gap-2"
            >
              <ArrowLeft className="size-4" />
              {t('returnToRoom')}
            </button>
          )}
          {onReturnToLobby && (
            <button
              type="button"
              onClick={onReturnToLobby}
              className="w-full bg-card text-foreground border-2 border-foreground py-2 rounded-[12px] font-semibold shadow-[#3d2e1e_-4px_4px_0px] transition-all hover:-translate-y-0.5 hover:shadow-[#3d2e1e_-5px_6px_0px] active:translate-y-px active:shadow-[#3d2e1e_-2px_2px_0px] flex items-center justify-center gap-2"
            >
              <Home className="size-4" />
              {t('returnToLobby')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
