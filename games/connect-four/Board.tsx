import { DiscBoard, PLAYER_DISC_BG } from '@repo/game-ui/board';
import { GameOverModal } from '@repo/game-ui/feedback';
import { PlayerBadge } from '@repo/game-ui/player';
import type { BoardProps } from '@repo/shared';
import { useTranslation } from 'react-i18next';
import type { Action, PlayerView } from './shared';
import { COLS, ROWS } from './shared';

export function Board({
  state,
  myId,
  players,
  sendAction,
  onReturnToRoom,
  onReturnToLobby,
}: BoardProps<PlayerView, Action>) {
  const { t } = useTranslation('connect-four');
  const isMyTurn = state.currentPlayer === myId;
  const gameOver = !!state.winner || state.isDraw;
  const playerNames = Object.fromEntries(players.map((p) => [p.id, p.name]));
  const loserPlayer = players.find((p) => p.id !== state.winner);

  function statusText() {
    if (state.winner) return `${playerNames[state.winner] ?? state.winner} ${t('won')}`;
    if (state.isDraw) return t('draw');
    if (isMyTurn) return t('yourTurn');
    return `${t('waiting')} ${playerNames[state.currentPlayer] ?? state.currentPlayer}...`;
  }

  return (
    <div
      className="min-h-screen text-foreground flex flex-col items-center justify-center gap-4 p-4"
      data-testid="game-board"
    >
      {/* Players */}
      <div className="flex gap-4 flex-wrap justify-center">
        {players.map((p) => (
          <PlayerBadge
            key={p.id}
            player={p}
            isCurrentTurn={state.currentPlayer === p.id}
            isMe={p.id === myId}
          />
        ))}
      </div>

      {/* Status */}
      <div className="text-sm text-muted-foreground font-medium">{statusText()}</div>

      {/* Board */}
      <DiscBoard
        rows={ROWS}
        cols={COLS}
        board={state.board}
        myPlayerIndex={state.myPlayerIndex}
        canPlay={isMyTurn && !gameOver}
        onColumnClick={(col) => sendAction({ type: 'drop', col })}
      />

      {/* My color indicator */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground font-medium bg-card border-2 border-foreground rounded-[8px] px-3 py-1.5 shadow-[2px_2px_0px_0px_#3d2e1e]">
        <div className={`w-4 h-4 rounded-full ${PLAYER_DISC_BG[state.myPlayerIndex]}`} />
        <span>{state.myPlayerIndex === 0 ? t('playRed') : t('playYellow')}</span>
      </div>

      {/* Game over modal */}
      {state.winner && loserPlayer && (
        <GameOverModal
          rankings={[state.winner, loserPlayer.id]}
          playerNames={playerNames}
          myId={myId}
          onReturnToRoom={onReturnToRoom}
          onReturnToLobby={onReturnToLobby}
        />
      )}
      {state.isDraw && (
        <GameOverModal
          rankings={players.map((p) => p.id)}
          playerNames={playerNames}
          myId={myId}
          onReturnToRoom={onReturnToRoom}
          onReturnToLobby={onReturnToLobby}
        />
      )}
    </div>
  );
}
