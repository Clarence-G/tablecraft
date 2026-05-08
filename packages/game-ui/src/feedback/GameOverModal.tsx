import { ArrowLeft, Frown, Handshake, Home, Trophy } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { PointsBadge } from '../points';

interface GameOverModalProps {
  rankings: string[];
  playerNames: Record<string, string>;
  myId: string;
  pointsDelta?: Record<string, number>;
  totalPoints?: number;
  ties?: string[][];
  onRestart?: () => void;
  onReturnToRoom?: () => void;
  /**
   * Gates the "Return to Room" button. When false and `onReturnToRoom` is
   * provided, the button renders as disabled with a "Waiting for host" label.
   * Defaults to true.
   */
  canReturnToRoom?: boolean;
  onReturnToLobby?: () => void;
}

function isInTopTie(ties: string[][] | undefined, topRanked: string, myId: string): boolean {
  if (!ties) return false;
  for (const group of ties) {
    if (group.includes(topRanked) && group.includes(myId)) return true;
  }
  return false;
}

export function GameOverModal({
  rankings,
  playerNames,
  myId,
  pointsDelta,
  totalPoints,
  ties,
  onRestart,
  onReturnToRoom,
  canReturnToRoom = true,
  onReturnToLobby,
}: GameOverModalProps) {
  const myRank = rankings.indexOf(myId) + 1;
  const topRanked = rankings[0];
  const isDraw = topRanked ? isInTopTie(ties, topRanked, myId) : false;
  const won = myRank === 1 && !isDraw;
  const myDelta = pointsDelta?.[myId] ?? 0;
  const { t } = useTranslation('game-ui');
  const firstActionRef = useRef<HTMLButtonElement | null>(null);

  // Escape closes the modal. Preference order matches the visible button
  // order so the "primary" dismissal path is chosen. Non-host viewers can't
  // restart, so skip onReturnToRoom for them.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const handler =
        onReturnToLobby ?? (canReturnToRoom ? onReturnToRoom : undefined) ?? onRestart;
      if (handler) {
        e.preventDefault();
        handler();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onRestart, onReturnToRoom, onReturnToLobby, canReturnToRoom]);

  // Focus the first action button on mount so keyboard users can act
  // immediately. Backdrop clicks intentionally do NOT dismiss — users
  // shouldn't lose the game result by a stray click.
  useEffect(() => {
    firstActionRef.current?.focus();
  }, []);

  return (
    // biome-ignore lint/a11y/useSemanticElements: native <dialog> requires imperative showModal()/close() wiring; keep ARIA-annotated <div> for existing focus-trap + backdrop-block logic
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="game-over-title"
      className="fixed inset-0 bg-[#1a1108]/50 flex items-center justify-center z-50"
      data-testid="game-over-modal"
    >
      <div className="bg-card border-thick border-foreground rounded-[16px] p-8 max-w-sm w-full mx-4 text-center shadow-card">
        <div className="flex justify-center mb-2">
          {isDraw ? (
            <Handshake className="size-10 text-warning" />
          ) : won ? (
            <Trophy className="size-10 text-warning" />
          ) : (
            <Frown className="size-10 text-muted-foreground" />
          )}
        </div>
        <h2 id="game-over-title" className="text-2xl font-bold mb-1 text-[#1a1108]">
          {isDraw ? t('draw') : won ? t('youWin') : t('rank', { rank: myRank })}
        </h2>

        {(pointsDelta !== undefined || totalPoints !== undefined) && (
          <div className="flex items-center justify-center gap-2 mb-2">
            {pointsDelta !== undefined && <PointsBadge label={t('match')} points={myDelta} />}
            {totalPoints !== undefined && <PointsBadge label={t('total')} points={totalPoints} />}
          </div>
        )}

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
              {pointsDelta !== undefined && (
                <span className={pid === myId ? '' : 'ml-auto'}>
                  <PointsBadge label="+" points={pointsDelta[pid] ?? 0} />
                </span>
              )}
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-2 mt-4">
          {onRestart && (
            <button
              type="button"
              ref={firstActionRef}
              onClick={onRestart}
              data-testid="restart-btn"
              className="w-full bg-primary text-primary-foreground border-2 border-[#1a1108] py-2 rounded-[12px] font-semibold shadow-button transition-all hover:-translate-y-0.5 hover:shadow-button-hover active:translate-y-px active:shadow-button-active"
            >
              {t('playAgain')}
            </button>
          )}
          {onReturnToRoom &&
            (canReturnToRoom ? (
              <button
                type="button"
                ref={onRestart ? undefined : firstActionRef}
                onClick={onReturnToRoom}
                className="w-full bg-primary text-primary-foreground border-2 border-[#1a1108] py-2 rounded-[12px] font-semibold shadow-button transition-all hover:-translate-y-0.5 hover:shadow-button-hover active:translate-y-px active:shadow-button-active flex items-center justify-center gap-2"
              >
                <ArrowLeft className="size-4" />
                {t('returnToRoom')}
              </button>
            ) : (
              <button
                type="button"
                disabled
                aria-disabled="true"
                className="w-full bg-secondary text-muted-foreground border-2 border-border py-2 rounded-[12px] font-semibold flex items-center justify-center gap-2 cursor-not-allowed opacity-70"
              >
                <ArrowLeft className="size-4" />
                {t('waitingForHost')}
              </button>
            ))}
          {onReturnToLobby && (
            <button
              type="button"
              ref={onRestart || (onReturnToRoom && canReturnToRoom) ? undefined : firstActionRef}
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
