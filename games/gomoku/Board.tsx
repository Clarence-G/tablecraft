import { useGameHeaderStatus } from '@repo/game-ui';
import { IntersectionBoard } from '@repo/game-ui/board';
import { GameOverModal } from '@repo/game-ui/feedback';
import type { BoardProps } from '@repo/shared';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation('gomoku');
  const isMyTurn = state.currentPlayer === myId;
  const gameOver = !!state.winner;
  const playerNames = Object.fromEntries(players.map((p) => [p.id, p.name]));
  const loserPlayer = players.find((p) => p.id !== state.winner);

  useGameHeaderStatus(state.winner ? undefined : state.currentPlayer);

  return (
    <div
      className="flex-1 text-foreground flex flex-col items-center justify-center gap-4 p-4 w-full"
      data-testid="game-board"
    >
      {state.winner && (
        <div className="text-sm font-semibold text-warning">
          {`${playerNames[state.winner] ?? state.winner} ${t('won')}`}
        </div>
      )}

      <IntersectionBoard
        size={BOARD_SIZE}
        stones={state.board}
        starPoints={STAR_POINTS}
        previewStone={isMyTurn && !gameOver ? state.myStone : undefined}
        canPlace={(r, c) => isMyTurn && !gameOver && !state.board[r][c]}
        onPlace={(r, c) => sendAction({ type: 'place', row: r, col: c })}
      />

      <div className="flex items-center gap-2 text-sm font-medium bg-foreground/85 text-card border-2 border-foreground rounded-[8px] px-3 py-1.5 shadow-button">
        <div
          className={`w-4 h-4 rounded-full border ${state.myStone === 'black' ? 'bg-[#1a1108] border-[#3d2e1e]' : 'bg-white border-[#c4b8a8]'}`}
        />
        <span>{state.myStone === 'black' ? t('playBlack') : t('playWhite')}</span>
      </div>

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
