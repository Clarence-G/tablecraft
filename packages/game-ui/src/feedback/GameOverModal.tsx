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
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
      data-testid="game-over-modal"
    >
      <div className="bg-gray-800 rounded-2xl p-8 max-w-sm w-full mx-4 text-center">
        <div className="text-4xl mb-2">{won ? '🎉' : '😢'}</div>
        <h2 className="text-2xl font-bold mb-1">{won ? '你赢了！' : `第 ${myRank} 名`}</h2>

        <div className="my-4 space-y-2">
          {rankings.map((pid, i) => (
            <div
              key={pid}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg
              ${i === 0 ? 'bg-yellow-500/20 text-yellow-300' : 'bg-gray-700 text-gray-300'}
            `}
            >
              <span className="font-bold w-6">{i + 1}.</span>
              <span>{playerNames[pid] ?? pid}</span>
              {pid === myId && <span className="text-xs text-blue-400 ml-auto">你</span>}
            </div>
          ))}
        </div>

        {onRestart && (
          <button
            type="button"
            onClick={onRestart}
            data-testid="restart-btn"
            className="w-full bg-blue-600 hover:bg-blue-500 py-2 rounded-xl font-semibold mt-2"
          >
            再来一局
          </button>
        )}
      </div>
    </div>
  );
}
