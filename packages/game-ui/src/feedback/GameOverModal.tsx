import { Frown, Trophy } from 'lucide-react';

interface GameOverModalProps {
  rankings: string[];
  playerNames: Record<string, string>;
  myId: string;
  onRestart?: () => void;
}

export function GameOverModal({ rankings, playerNames, myId, onRestart }: GameOverModalProps) {
  const myRank = rankings.indexOf(myId) + 1;
  const won = myRank === 1;

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
        <h2 className="text-2xl font-bold mb-1 text-[#1a1108]">{won ? '你赢了!' : `第 ${myRank} 名`}</h2>

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
              {pid === myId && <span className="text-xs text-muted-foreground ml-auto">你</span>}
            </div>
          ))}
        </div>

        {onRestart && (
          <button
            type="button"
            onClick={onRestart}
            data-testid="restart-btn"
            className="w-full bg-primary text-primary-foreground border-2 border-[#1a1108] py-2 rounded-[12px] font-semibold mt-2 shadow-button transition-all hover:-translate-y-0.5 hover:shadow-button-hover active:translate-y-px active:shadow-button-active"
          >
            再来一局
          </button>
        )}
      </div>
    </div>
  );
}
