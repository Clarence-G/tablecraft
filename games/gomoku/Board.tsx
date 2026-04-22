import { useGameHeaderStatus } from '@repo/game-ui';
import { IntersectionBoard } from '@repo/game-ui/board';
import { GameOverModal } from '@repo/game-ui/feedback';
import { useGameLog } from '@repo/game-ui/log';
import type { BoardProps } from '@repo/shared';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { Action, PlayerView, Stone } from './shared';
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
  const { push } = useGameLog();
  const isMyTurn = state.currentPlayer === myId;
  const gameOver = !!state.winner;
  const playerNames = Object.fromEntries(players.map((p) => [p.id, p.name]));
  const loserPlayer = players.find((p) => p.id !== state.winner);

  useGameHeaderStatus(state.winner ? undefined : state.currentPlayer);

  const prevBoard = useRef<(Stone | null)[][] | null>(null);
  const loggedWinner = useRef<string | null>(null);
  useEffect(() => {
    const prev = prevBoard.current;
    if (prev) {
      for (let r = 0; r < state.board.length; r++) {
        for (let c = 0; c < state.board[r].length; c++) {
          const now = state.board[r][c];
          const was = prev[r]?.[c] ?? null;
          if (now && !was) {
            const moverId =
              now === state.myStone
                ? myId
                : (players.find((p) => p.id !== myId)?.id ?? state.currentPlayer);
            push({
              kind: 'action',
              actorId: playerNames[moverId] ?? moverId,
              messageKey: 'gomoku.log.move',
              messageParams: { row: r, col: c, stone: t(`stone.${now}`) },
            });
          }
        }
      }
    }
    prevBoard.current = state.board.map((row) => [...row]);
  }, [state.board, myId, players, state.currentPlayer, state.myStone, playerNames, push, t]);

  useEffect(() => {
    if (state.winner && loggedWinner.current !== state.winner) {
      loggedWinner.current = state.winner;
      push({
        kind: 'system',
        messageKey: 'gomoku.log.win',
        messageParams: { player: playerNames[state.winner] ?? state.winner },
      });
    }
  }, [state.winner, playerNames, push]);

  return (
    <div
      className="flex-1 text-foreground flex flex-col items-center justify-center gap-4 p-4 sm:p-6 w-full min-h-0"
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
        showCoordinates
      />
      <div className="flex items-center gap-2 text-sm font-semibold bg-card border-2 border-foreground rounded-[10px] px-3 py-1.5 shadow-button">
        <div
          className={`w-4 h-4 rounded-full border-2 ${state.myStone === 'black' ? 'bg-[#1a1108] border-foreground' : 'bg-card border-foreground'}`}
        />
        <span className="text-foreground">
          {state.myStone === 'black' ? t('playBlack') : t('playWhite')}
        </span>
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
