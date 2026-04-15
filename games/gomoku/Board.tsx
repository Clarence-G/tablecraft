import { GameOverModal } from '@repo/game-ui/feedback';
import { PlayerBadge } from '@repo/game-ui/player';
import { IntersectionBoard } from '@repo/game-ui/board';
import type { BoardProps } from '@repo/shared';
import type { Action, PlayerView } from './shared';
import { BOARD_SIZE } from './shared';

const STAR_POINTS: [number, number][] = [
  [3, 3],
  [3, 11],
  [7, 7],
  [11, 3],
  [11, 11],
];

export function Board({ state, myId, players, sendAction }: BoardProps<PlayerView, Action>) {
  const isMyTurn = state.currentPlayer === myId;
  const gameOver = !!state.winner;
  const playerNames = Object.fromEntries(players.map((p) => [p.id, p.name]));
  const loserPlayer = players.find((p) => p.id !== state.winner);

  return (
    <div
      className="min-h-screen text-foreground flex flex-col items-center justify-center gap-4 p-4"
      data-testid="game-board"
    >
      {/* Players */}
      <div className="flex gap-4">
        {players.map((p) => (
          <PlayerBadge
            key={p.id}
            player={p}
            isCurrentTurn={state.currentPlayer === p.id}
            isMe={p.id === myId}
          />
        ))}
      </div>

      {/* Turn indicator */}
      <div className="text-sm text-muted-foreground">
        {state.winner
          ? `${playerNames[state.winner] ?? state.winner} 获胜！`
          : isMyTurn
            ? '你的回合'
            : `等待 ${playerNames[state.currentPlayer] ?? state.currentPlayer}...`}
      </div>

      {/* Board */}
      <IntersectionBoard
        size={BOARD_SIZE}
        stones={state.board}
        starPoints={STAR_POINTS}
        previewStone={isMyTurn && !gameOver ? state.myStone : undefined}
        canPlace={(r, c) => isMyTurn && !gameOver && !state.board[r][c]}
        onPlace={(r, c) => sendAction({ type: 'place', row: r, col: c })}
      />

      {/* My stone indicator */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <div
          className={`w-4 h-4 rounded-full ${state.myStone === 'black' ? 'bg-background border border-border' : 'bg-white'}`}
        />
        <span>你执{state.myStone === 'black' ? '黑子' : '白子'}</span>
      </div>

      {/* Game over modal */}
      {state.winner && loserPlayer && (
        <GameOverModal
          rankings={[state.winner, loserPlayer.id]}
          playerNames={playerNames}
          myId={myId}
        />
      )}
    </div>
  );
}
