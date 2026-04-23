import { useGameHeaderStatus } from '@repo/game-ui';
import { IntersectionBoard } from '@repo/game-ui/board';
import { GameOverModal } from '@repo/game-ui/feedback';
import { useGameLog } from '@repo/game-ui/log';
import type { BoardProps } from '@repo/shared';
import { useEffect, useMemo, useRef, useState } from 'react';
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

export function Board({
  state,
  myId,
  players,
  sendAction,
  isSending,
  lastReject,
}: BoardProps<PlayerView, Action>) {
  const { t } = useTranslation('gomoku');
  const { push } = useGameLog();
  const gameOver = !!state.winner;
  const playerNames = Object.fromEntries(players.map((p) => [p.id, p.name]));
  const loserPlayer = players.find((p) => p.id !== state.winner);

  // Optimistic move: show the stone we just placed immediately, without waiting
  // for the server round-trip. Cleared once `isSending` flips to false — at that
  // point the server has either acked (state.board will show our stone) or
  // rejected (lastReject will have fired) or the send timeout expired. In all
  // three cases we stop showing the optimistic overlay.
  const [pendingMove, setPendingMove] = useState<{ r: number; c: number; stone: Stone } | null>(
    null,
  );
  useEffect(() => {
    if (!isSending) setPendingMove(null);
  }, [isSending]);
  // Roll back immediately on server reject (don't wait for isSending transition).
  useEffect(() => {
    if (lastReject) setPendingMove(null);
  }, [lastReject]);

  // Apply optimistic move on top of server board for display only.
  const displayBoard = useMemo(() => {
    if (!pendingMove) return state.board;
    const rows = state.board.map((row) => [...row]);
    rows[pendingMove.r][pendingMove.c] = pendingMove.stone;
    return rows;
  }, [state.board, pendingMove]);

  // Optimistic "turn" — once we've placed a pending stone, act as if it's not
  // our turn so the board reflects "waiting for opponent" visually.
  const isMyTurn = state.currentPlayer === myId && !pendingMove;

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
        stones={displayBoard}
        starPoints={STAR_POINTS}
        previewStone={isMyTurn && !gameOver ? state.myStone : undefined}
        canPlace={(r, c) => isMyTurn && !gameOver && !displayBoard[r][c]}
        onPlace={(r, c) => {
          setPendingMove({ r, c, stone: state.myStone });
          sendAction({ type: 'place', row: r, col: c });
        }}
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
