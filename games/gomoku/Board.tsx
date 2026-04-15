import { GameOverModal } from '@repo/game-ui/feedback';
import { PlayerBadge } from '@repo/game-ui/player';
import type { BoardProps } from '@repo/shared';
import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import type { Action, PlayerView, Stone } from './shared';
import { BOARD_SIZE } from './shared';

const CELL_SIZE = 36;

function StoneCircle({ stone }: { stone: Stone }) {
  return (
    <motion.div
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      className={`w-7 h-7 rounded-full shadow-md ${
        stone === 'black' ? 'bg-gray-900 border border-gray-600' : 'bg-white border border-gray-300'
      }`}
    />
  );
}

export function Board({ state, myId, players, sendAction }: BoardProps<PlayerView, Action>) {
  const isMyTurn = state.currentPlayer === myId;
  const [hoveredCell, setHoveredCell] = useState<[number, number] | null>(null);

  const playerNames = Object.fromEntries(players.map((p) => [p.id, p.name]));

  function handleClick(row: number, col: number) {
    if (!isMyTurn || state.board[row][col] || state.winner) return;
    sendAction({ type: 'place', row, col });
  }

  const loserPlayer = players.find((p) => p.id !== state.winner);

  return (
    <div
      className="min-h-screen bg-green-950 text-white flex flex-col items-center justify-center gap-4 p-4"
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
      <div className="text-sm text-gray-300">
        {state.winner
          ? `${playerNames[state.winner] ?? state.winner} 获胜！`
          : isMyTurn
            ? '你的回合'
            : `等待 ${playerNames[state.currentPlayer] ?? state.currentPlayer}...`}
      </div>

      {/* Board */}
      <div
        className="relative bg-amber-800 rounded-lg p-3 shadow-2xl"
        style={{
          width: BOARD_SIZE * CELL_SIZE + 24,
          height: BOARD_SIZE * CELL_SIZE + 24,
        }}
      >
        {/* Grid lines — decorative SVG, not interactive */}
        <svg
          aria-hidden="true"
          className="absolute inset-3"
          width={BOARD_SIZE * CELL_SIZE}
          height={BOARD_SIZE * CELL_SIZE}
          style={{ pointerEvents: 'none' }}
        >
          {Array.from({ length: BOARD_SIZE }, (_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: grid lines are positionally stable
            <g key={i}>
              <line
                x1={i * CELL_SIZE + CELL_SIZE / 2}
                y1={CELL_SIZE / 2}
                x2={i * CELL_SIZE + CELL_SIZE / 2}
                y2={(BOARD_SIZE - 0.5) * CELL_SIZE}
                stroke="#5c3d11"
                strokeWidth="1"
              />
              <line
                x1={CELL_SIZE / 2}
                y1={i * CELL_SIZE + CELL_SIZE / 2}
                x2={(BOARD_SIZE - 0.5) * CELL_SIZE}
                y2={i * CELL_SIZE + CELL_SIZE / 2}
                stroke="#5c3d11"
                strokeWidth="1"
              />
            </g>
          ))}
          {[
            [3, 3],
            [3, 11],
            [7, 7],
            [11, 3],
            [11, 11],
          ].map(([r, c]) => (
            <circle
              key={`${r}-${c}`}
              cx={c * CELL_SIZE + CELL_SIZE / 2}
              cy={r * CELL_SIZE + CELL_SIZE / 2}
              r="3"
              fill="#5c3d11"
            />
          ))}
        </svg>

        {/* Cells (click targets + stones) */}
        <div
          className="absolute inset-3 grid"
          style={{
            gridTemplateRows: `repeat(${BOARD_SIZE}, ${CELL_SIZE}px)`,
            gridTemplateColumns: `repeat(${BOARD_SIZE}, ${CELL_SIZE}px)`,
          }}
        >
          {state.board.map((row, r) =>
            row.map((cell, c) => {
              const isHovered = hoveredCell?.[0] === r && hoveredCell?.[1] === c;
              const canPlace = isMyTurn && !cell && !state.winner;
              return (
                <button
                  type="button"
                  // biome-ignore lint/suspicious/noArrayIndexKey: board coordinates are stable positional keys
                  key={`${r}-${c}`}
                  className="flex items-center justify-center bg-transparent border-none p-0"
                  style={{ cursor: canPlace ? 'pointer' : 'default' }}
                  disabled={!canPlace}
                  onClick={() => handleClick(r, c)}
                  onMouseEnter={() => canPlace && setHoveredCell([r, c])}
                  onMouseLeave={() => setHoveredCell(null)}
                  data-row={r}
                  data-col={c}
                  aria-label={`行${r + 1} 列${c + 1}${cell ? ` (${cell === 'black' ? '黑' : '白'})` : ''}`}
                >
                  <AnimatePresence>
                    {cell && (
                      // biome-ignore lint/suspicious/noArrayIndexKey: stone keys use stable board coordinates
                      <StoneCircle key={`stone-${r}-${c}`} stone={cell} />
                    )}
                    {!cell && isHovered && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 0.4 }}
                        exit={{ opacity: 0 }}
                        className={`w-7 h-7 rounded-full ${
                          state.myStone === 'black' ? 'bg-gray-900' : 'bg-white'
                        }`}
                      />
                    )}
                  </AnimatePresence>
                </button>
              );
            }),
          )}
        </div>
      </div>

      {/* My stone indicator */}
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <div
          className={`w-4 h-4 rounded-full ${state.myStone === 'black' ? 'bg-gray-900 border border-gray-500' : 'bg-white'}`}
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
