import { useGameHeaderStatus } from '@repo/game-ui';
import { DiscBoard, PLAYER_DISC_BG } from '@repo/game-ui/board';
import { GameOverModal } from '@repo/game-ui/feedback';
import type { BoardProps } from '@repo/shared';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Action, PlayerView } from './shared';
import { COLS, ROWS } from './shared';

export function Board({
  state,
  myId,
  players,
  sendAction,
  isSending,
  lastReject,
}: BoardProps<PlayerView, Action>) {
  const { t } = useTranslation('connect-four');
  const gameOver = !!state.winner || state.isDraw;
  const playerNames = Object.fromEntries(players.map((p) => [p.id, p.name]));
  const loserPlayer = players.find((p) => p.id !== state.winner);

  // Optimistic drop: immediately show the piece falling into the chosen column
  // so the UI feels instant under network latency. Cleared on ack/reject/timeout
  // (driven by the `isSending` flag in GameStore) and immediately on server reject.
  const [pendingCol, setPendingCol] = useState<number | null>(null);
  useEffect(() => {
    if (!isSending) setPendingCol(null);
  }, [isSending]);
  useEffect(() => {
    if (lastReject) setPendingCol(null);
  }, [lastReject]);

  const displayBoard = useMemo(() => {
    if (pendingCol === null) return state.board;
    const next = [...state.board];
    for (let row = ROWS - 1; row >= 0; row--) {
      const idx = row * COLS + pendingCol;
      if (next[idx] === 0) {
        next[idx] = state.myPlayerIndex + 1;
        break;
      }
    }
    return next;
  }, [state.board, state.myPlayerIndex, pendingCol]);

  const isMyTurn = state.currentPlayer === myId && pendingCol === null;

  useGameHeaderStatus(gameOver ? undefined : state.currentPlayer);

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
      {state.isDraw && (
        <div className="text-sm font-semibold text-muted-foreground">{t('draw')}</div>
      )}

      <DiscBoard
        rows={ROWS}
        cols={COLS}
        board={displayBoard}
        myPlayerIndex={state.myPlayerIndex}
        canPlay={isMyTurn && !gameOver}
        onColumnClick={(col) => {
          setPendingCol(col);
          sendAction({ type: 'drop', col });
        }}
        getColumnAriaLabel={(col) => t('dropInColumn', { col: col + 1 })}
      />

      <div className="flex items-center gap-2 text-sm font-medium bg-foreground/85 text-card border-2 border-foreground rounded-[8px] px-3 py-1.5 shadow-button">
        <div className={`w-4 h-4 rounded-full ${PLAYER_DISC_BG[state.myPlayerIndex]}`} />
        <span>{state.myPlayerIndex === 0 ? t('playRed') : t('playYellow')}</span>
      </div>

      {state.winner && loserPlayer && (
        <GameOverModal
          rankings={[state.winner, loserPlayer.id]}
          playerNames={playerNames}
          myId={myId}
        />
      )}
      {state.isDraw && (
        <GameOverModal rankings={players.map((p) => p.id)} playerNames={playerNames} myId={myId} />
      )}
    </div>
  );
}
