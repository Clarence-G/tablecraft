import { useGameHeaderStatus } from '@repo/game-ui';
import { IntersectionBoard } from '@repo/game-ui/board';
import { GameOverModal } from '@repo/game-ui/feedback';
import { useGameLog } from '@repo/game-ui/log';
import type { BoardProps } from '@repo/shared';
import { motion } from 'framer-motion';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Action, PlayerView, Stone } from './shared';
import { BOARD_SIZE, STONE_COLORS } from './shared';

const STAR_POINTS: [number, number][] = [
  [3, 3],
  [3, 11],
  [7, 7],
  [11, 3],
  [11, 11],
];

const DIRECTIONS: Array<[number, number]> = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
];

function findWinningLine(board: (Stone | null)[][], stone: Stone): [number, number][] | null {
  for (let r = 0; r < board.length; r++) {
    for (let c = 0; c < board[r].length; c++) {
      if (board[r][c] !== stone) continue;
      for (const [dr, dc] of DIRECTIONS) {
        const cells: [number, number][] = [];
        for (let i = 0; i < 5; i++) {
          const nr = r + dr * i;
          const nc = c + dc * i;
          if (nr < 0 || nr >= BOARD_SIZE || nc < 0 || nc >= BOARD_SIZE) break;
          if (board[nr][nc] !== stone) break;
          cells.push([nr, nc]);
        }
        if (cells.length === 5) return cells;
      }
    }
  }
  return null;
}

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

  const [pendingMove, setPendingMove] = useState<{ r: number; c: number; stone: Stone } | null>(
    null,
  );
  useEffect(() => {
    if (!isSending) setPendingMove(null);
  }, [isSending]);
  useEffect(() => {
    if (lastReject) setPendingMove(null);
  }, [lastReject]);

  const displayBoard = useMemo(() => {
    if (!pendingMove) return state.board;
    const rows = state.board.map((row) => [...row]);
    rows[pendingMove.r][pendingMove.c] = pendingMove.stone;
    return rows;
  }, [state.board, pendingMove]);

  const isMyTurn = state.currentPlayer === myId && !pendingMove;

  useGameHeaderStatus(state.winner ? undefined : state.currentPlayer);

  const [lastMove, setLastMove] = useState<[number, number] | null>(null);
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
            setLastMove([r, c]);
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

  const winningCells = useMemo<[number, number][] | null>(() => {
    if (!state.winner) return null;
    const winnerStone: Stone =
      state.winner === myId ? state.myStone : state.myStone === 'black' ? 'white' : 'black';
    return findWinningLine(state.board, winnerStone);
  }, [state.winner, state.board, state.myStone, myId]);

  // Delay the GameOverModal so players can see the winning line glow first.
  const [showModal, setShowModal] = useState(false);
  useEffect(() => {
    if (!state.winner) {
      setShowModal(false);
      return;
    }
    const id = setTimeout(() => setShowModal(true), 1200);
    return () => clearTimeout(id);
  }, [state.winner]);

  const currentPlayerName = playerNames[state.currentPlayer] ?? state.currentPlayer;
  const currentIsBot = !gameOver && !isMyTurn && currentPlayerName.startsWith('Bot');

  const turnLabel: string = gameOver
    ? `${playerNames[state.winner ?? ''] ?? state.winner} ${t('won')}`
    : isMyTurn
      ? t('yourTurn')
      : currentIsBot
        ? t('botThinking', {
            name: currentPlayerName,
          })
        : t('opponentTurn', {
            name: currentPlayerName,
          });

  const renderCellOverlay = (r: number, c: number): ReactNode => {
    const overlays: ReactNode[] = [];
    if (winningCells?.some(([wr, wc]) => wr === r && wc === c)) {
      overlays.push(
        <div
          key="win"
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
        >
          <motion.div
            className="w-[82%] h-[82%] rounded-full"
            animate={{
              boxShadow: [
                '0 0 0 2px rgba(217,119,6,0.75), 0 0 10px 2px rgba(217,119,6,0.45)',
                '0 0 0 3px rgba(217,119,6,1), 0 0 22px 6px rgba(217,119,6,0.75)',
                '0 0 0 2px rgba(217,119,6,0.75), 0 0 10px 2px rgba(217,119,6,0.45)',
              ],
            }}
            transition={{ duration: 1.4, repeat: Number.POSITIVE_INFINITY, ease: 'easeInOut' }}
          />
        </div>,
      );
    }
    if (!winningCells && lastMove && lastMove[0] === r && lastMove[1] === c) {
      overlays.push(
        <div
          key="last"
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
        >
          <div
            className="w-[18%] h-[18%] rounded-full bg-destructive"
            style={{ boxShadow: '0 0 0 1.5px rgba(255,255,255,0.9)' }}
          />
        </div>,
      );
    }
    return overlays.length ? <>{overlays}</> : null;
  };

  const turnCardAnimate =
    isMyTurn && !gameOver
      ? {
          boxShadow: [
            'hsl(var(--shadow)) -4px 4px 0px, 0 0 0 0 rgba(217,119,6,0)',
            'hsl(var(--shadow)) -4px 4px 0px, 0 0 0 4px rgba(217,119,6,0.45)',
            'hsl(var(--shadow)) -4px 4px 0px, 0 0 0 0 rgba(217,119,6,0)',
          ],
          opacity: [1, 0.92, 1],
        }
      : { boxShadow: 'hsl(var(--shadow)) -4px 4px 0px', opacity: 1 };

  return (
    <div
      className="flex-1 text-foreground flex flex-col items-center justify-center gap-4 p-4 sm:p-6 w-full min-h-0"
      data-testid="game-board"
    >
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
        renderOverlay={renderCellOverlay}
        showCoordinates
      />
      <motion.div
        className="flex items-center gap-2 text-sm font-semibold bg-card border-2 border-foreground rounded-[10px] px-3 py-1.5"
        animate={turnCardAnimate}
        transition={
          isMyTurn && !gameOver
            ? { duration: 2.2, repeat: Number.POSITIVE_INFINITY, ease: 'easeInOut' }
            : { duration: 0.2 }
        }
      >
        <div
          className={`w-4 h-4 rounded-full border-2 border-foreground ${state.myStone === 'black' ? STONE_COLORS.black.bgClass : STONE_COLORS.white.bgClass}`}
        />
        <span className="text-foreground">
          {state.myStone === 'black' ? t('playBlack') : t('playWhite')}
        </span>
        <span className="mx-1 text-border" aria-hidden>
          ·
        </span>
        <span className={isMyTurn && !gameOver ? 'text-warning' : 'text-muted-foreground'}>
          {turnLabel}
        </span>
      </motion.div>

      {state.winner && loserPlayer && showModal && (
        <GameOverModal
          rankings={[state.winner, loserPlayer.id]}
          playerNames={playerNames}
          myId={myId}
        />
      )}
    </div>
  );
}
