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
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
      data-testid="game-over-modal"
    >
      <div className="bg-card ring-1 ring-foreground/10 rounded-xl p-8 max-w-sm w-full mx-4 text-center">
        <div className="text-4xl mb-2">{won ? '🎉' : '😢'}</div>
        <h2 className="text-2xl font-bold mb-1">{won ? '你赢了！' : `第 ${myRank} 名`}</h2>

        <div className="my-4 space-y-2">
          {rankings.map((pid, i) => (
            <div
              key={pid}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg
              ${i === 0 ? 'bg-warning/15 text-warning' : 'bg-secondary text-muted-foreground'}
            `}
            >
              <span className="font-bold w-6">{i + 1}.</span>
              <span>{playerNames[pid] ?? pid}</span>
              {pid === myId && <span className="text-xs text-muted-foreground ml-auto">你</span>}
            </div>
          ))}
        </div>

        {onRestart && (
          <button
            type="button"
            onClick={onRestart}
            data-testid="restart-btn"
            className="w-full bg-primary text-primary-foreground hover:bg-primary/80 py-2 rounded-lg font-semibold mt-2 transition"
          >
            再来一局
          </button>
        )}
      </div>
    </div>
  );
}
