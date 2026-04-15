import { GameOverModal } from '@repo/game-ui/feedback';
import { PlayerBadge } from '@repo/game-ui/player';
import type { BoardProps } from '@repo/shared';
import { useMemo, useState } from 'react';
import type { Action, HexCoord, HivePieceType, PlayerView, Tile } from './shared';
import { HEX_SIZE, coordKey, hexToPixel } from './shared';

// ============ Piece Icons (SVG) ============

function QueenIcon({ color }: { color: string }) {
  return (
    <g fill={color} stroke={color} strokeWidth={0.5}>
      <ellipse cx={12} cy={14} rx={4.5} ry={3.5} />
      <circle cx={12} cy={9} r={2.2} />
      <ellipse cx={7} cy={11} rx={3} ry={1.8} fill="none" strokeWidth={1} opacity={0.7} />
      <ellipse cx={17} cy={11} rx={3} ry={1.8} fill="none" strokeWidth={1} opacity={0.7} />
      <path d="M10.5 7.5 Q9 4 7.5 3.5" fill="none" strokeWidth={1} strokeLinecap="round" />
      <path d="M13.5 7.5 Q15 4 16.5 3.5" fill="none" strokeWidth={1} strokeLinecap="round" />
      <line
        x1={8.5}
        y1={13}
        x2={15.5}
        y2={13}
        stroke={color === '#1a1108' ? '#555' : '#aaa'}
        strokeWidth={0.7}
        opacity={0.5}
      />
      <line
        x1={8.5}
        y1={15}
        x2={15.5}
        y2={15}
        stroke={color === '#1a1108' ? '#555' : '#aaa'}
        strokeWidth={0.7}
        opacity={0.5}
      />
    </g>
  );
}

function SpiderIcon({ color }: { color: string }) {
  return (
    <g fill={color} stroke={color} strokeWidth={1} strokeLinecap="round">
      <circle cx={12} cy={13} r={3} />
      <circle cx={12} cy={9} r={1.8} />
      <path d="M9.5 11 Q6 8 4 6" fill="none" />
      <path d="M9.2 13 Q5.5 12 3 11" fill="none" />
      <path d="M9.5 15 Q6 17 4 19" fill="none" />
      <path d="M10 16 Q8 19 6.5 20.5" fill="none" />
      <path d="M14.5 11 Q18 8 20 6" fill="none" />
      <path d="M14.8 13 Q18.5 12 21 11" fill="none" />
      <path d="M14.5 15 Q18 17 20 19" fill="none" />
      <path d="M14 16 Q16 19 17.5 20.5" fill="none" />
    </g>
  );
}

function BeetleIcon({ color }: { color: string }) {
  return (
    <g fill={color} stroke={color} strokeWidth={0.5}>
      <ellipse cx={12} cy={14} rx={5} ry={4} />
      <line
        x1={12}
        y1={10}
        x2={12}
        y2={18}
        stroke={color === '#1a1108' ? '#555' : '#aaa'}
        strokeWidth={0.8}
      />
      <circle cx={12} cy={9} r={2} />
      <line x1={8} y1={12} x2={5} y2={10} strokeWidth={1} strokeLinecap="round" />
      <line x1={7.5} y1={14} x2={4.5} y2={14} strokeWidth={1} strokeLinecap="round" />
      <line x1={8} y1={16} x2={5} y2={18} strokeWidth={1} strokeLinecap="round" />
      <line x1={16} y1={12} x2={19} y2={10} strokeWidth={1} strokeLinecap="round" />
      <line x1={16.5} y1={14} x2={19.5} y2={14} strokeWidth={1} strokeLinecap="round" />
      <line x1={16} y1={16} x2={19} y2={18} strokeWidth={1} strokeLinecap="round" />
    </g>
  );
}

function GrasshopperIcon({ color }: { color: string }) {
  return (
    <g fill={color} stroke={color} strokeWidth={0.5}>
      <ellipse cx={12} cy={13} rx={5.5} ry={2.5} />
      <circle cx={18} cy={11.5} r={2} />
      <path d="M19.5 10 Q21 7 22 5.5" fill="none" strokeWidth={0.8} strokeLinecap="round" />
      <path d="M18.5 9.5 Q19 6.5 20 5" fill="none" strokeWidth={0.8} strokeLinecap="round" />
      <path
        d="M8 14.5 L5.5 10 L3 16"
        fill="none"
        strokeWidth={1.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9 15 L7 11 L4.5 17"
        fill="none"
        strokeWidth={1.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line x1={14} y1={15} x2={13} y2={18.5} strokeWidth={0.8} strokeLinecap="round" />
      <line x1={16} y1={14.5} x2={16} y2={18} strokeWidth={0.8} strokeLinecap="round" />
      <ellipse cx={12} cy={11.5} rx={4} ry={1.5} fill="none" strokeWidth={0.7} opacity={0.5} />
    </g>
  );
}

function AntIcon({ color }: { color: string }) {
  return (
    <g fill={color} stroke={color} strokeWidth={0.5}>
      <ellipse cx={8} cy={15} rx={3} ry={2.5} />
      <ellipse cx={12} cy={13.5} rx={2} ry={1.8} />
      <circle cx={16} cy={11.5} r={2.2} />
      <path d="M17.5 9.8 Q19 7 20.5 5.5" fill="none" strokeWidth={0.8} strokeLinecap="round" />
      <path d="M16.5 9.5 Q17 6.5 18.5 5" fill="none" strokeWidth={0.8} strokeLinecap="round" />
      <line x1={10.5} y1={14.5} x2={8} y2={18} strokeWidth={0.8} strokeLinecap="round" />
      <line x1={11} y1={13} x2={8.5} y2={10} strokeWidth={0.8} strokeLinecap="round" />
      <line x1={12.5} y1={15} x2={11.5} y2={18.5} strokeWidth={0.8} strokeLinecap="round" />
      <line x1={13} y1={12.5} x2={12} y2={9.5} strokeWidth={0.8} strokeLinecap="round" />
      <line x1={15} y1={13} x2={14.5} y2={17} strokeWidth={0.8} strokeLinecap="round" />
      <line x1={15.5} y1={12} x2={15} y2={9} strokeWidth={0.8} strokeLinecap="round" />
    </g>
  );
}

type IconComponent = (props: { color: string }) => React.ReactNode;

const PIECE_ICONS: Record<HivePieceType, IconComponent> = {
  queen: QueenIcon,
  spider: SpiderIcon,
  beetle: BeetleIcon,
  grasshopper: GrasshopperIcon,
  ant: AntIcon,
};

const PIECE_NAMES: Record<HivePieceType, string> = {
  queen: '蜂后',
  spider: '蜘蛛',
  beetle: '甲虫',
  grasshopper: '蚱蜢',
  ant: '蚂蚁',
};

// ============ Hex geometry ============

function hexPoints(cx: number, cy: number, size: number): string {
  const points: string[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i;
    const px = cx + size * Math.cos(angle);
    const py = cy + size * Math.sin(angle);
    points.push(`${px.toFixed(2)},${py.toFixed(2)}`);
  }
  return points.join(' ');
}

// ============ HexTile ============

interface HexTileProps {
  x: number;
  y: number;
  size: number;
  tile: Tile;
  selected?: boolean;
  isMoveable?: boolean;
  onClick?: () => void;
}

function HexTile({ x, y, size, tile, selected, isMoveable, onClick }: HexTileProps) {
  const isWhite = tile.color === 'white';
  const fill = isWhite ? '#ffffff' : '#1a1108';
  const defaultStroke = isWhite ? '#3d2e1e' : '#c4b8a8';
  const stroke = selected ? '#d97706' : defaultStroke;
  const strokeWidth = selected ? 3 : 1.5;
  const iconColor = isWhite ? '#1a1108' : '#fef3e0';
  const IconComponent = PIECE_ICONS[tile.type];
  const iconScale = (size * 0.7) / 24;

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: SVG interactive element
    <g
      onClick={onClick}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
      opacity={isMoveable && !selected ? 0.85 : 1}
    >
      <polygon
        points={hexPoints(x, y, size * 0.9)}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
      {/* Icon */}
      <g
        transform={`translate(${x - 12 * iconScale}, ${y - 12 * iconScale}) scale(${iconScale})`}
        style={{ pointerEvents: 'none' }}
      >
        <IconComponent color={iconColor} />
      </g>
      {/* Stack badge */}
      {tile.stackLevel > 0 && (
        <>
          <circle
            cx={x + size * 0.55}
            cy={y - size * 0.55}
            r={size * 0.22}
            fill="#7c3aed"
            stroke="#fef3e0"
            strokeWidth={1}
          />
          <text
            x={x + size * 0.55}
            y={y - size * 0.55 + 1}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={size * 0.25}
            fontWeight="bold"
            fill="#fef3e0"
            style={{ pointerEvents: 'none', userSelect: 'none' }}
          >
            {tile.stackLevel + 1}
          </text>
        </>
      )}
    </g>
  );
}

// ============ Board Component ============

export function Board({
  state,
  myId,
  players,
  sendAction,
  onReturnToRoom,
  onReturnToLobby,
}: BoardProps<PlayerView, Action>) {
  const [selectedPieceType, setSelectedPieceType] = useState<HivePieceType | null>(null);
  const [selectedTileCoord, setSelectedTileCoord] = useState<HexCoord | null>(null);

  const isMyTurn = state.currentPlayer === myId;
  const gameOver = state.phase === 'finished';
  const playerNames = Object.fromEntries(players.map((p) => [p.id, p.name]));

  // Build top-tile map for rendering
  const topTiles = useMemo(() => {
    const map = new Map<string, Tile>();
    for (const t of state.tiles) {
      const key = coordKey(t.coord);
      const existing = map.get(key);
      if (!existing || t.stackLevel > existing.stackLevel) {
        map.set(key, t);
      }
    }
    return Array.from(map.values());
  }, [state.tiles]);

  // Determine valid targets based on selection
  const validTargets = useMemo<HexCoord[]>(() => {
    if (!isMyTurn || !state.validActions) return [];

    if (selectedPieceType) {
      const group = state.validActions.placements.find((p) => p.pieceType === selectedPieceType);
      return group?.targets ?? [];
    }

    if (selectedTileCoord) {
      const group = state.validActions.moves.find(
        (m) => m.from.q === selectedTileCoord.q && m.from.r === selectedTileCoord.r,
      );
      return group?.targets ?? [];
    }

    return [];
  }, [isMyTurn, state.validActions, selectedPieceType, selectedTileCoord]);

  const targetSet = useMemo(() => {
    const set = new Set<string>();
    for (const t of validTargets) {
      set.add(coordKey(t));
    }
    return set;
  }, [validTargets]);

  const moveableTileSet = useMemo(() => {
    const set = new Set<string>();
    if (!isMyTurn || !state.validActions) return set;
    for (const m of state.validActions.moves) {
      set.add(coordKey(m.from));
    }
    return set;
  }, [isMyTurn, state.validActions]);

  // Determine if pass is the only option
  const canPass = useMemo(() => {
    if (!isMyTurn || !state.validActions) return false;
    return state.validActions.placements.length === 0 && state.validActions.moves.length === 0;
  }, [isMyTurn, state.validActions]);

  // Compute viewBox
  const viewBox = useMemo(() => {
    const allPoints: { x: number; y: number }[] = [];
    for (const t of topTiles) {
      allPoints.push(hexToPixel(t.coord));
    }
    for (const t of validTargets) {
      allPoints.push(hexToPixel(t));
    }
    if (allPoints.length === 0) {
      allPoints.push({ x: 0, y: 0 });
    }
    const padding = HEX_SIZE * 2.5;
    const minX = Math.min(...allPoints.map((p) => p.x)) - padding;
    const maxX = Math.max(...allPoints.map((p) => p.x)) + padding;
    const minY = Math.min(...allPoints.map((p) => p.y)) - padding;
    const maxY = Math.max(...allPoints.map((p) => p.y)) + padding;
    const w = maxX - minX;
    const h = maxY - minY;
    return { x: minX, y: minY, w: Math.max(w, 200), h: Math.max(h, 200) };
  }, [topTiles, validTargets]);

  function clearSelection() {
    setSelectedPieceType(null);
    setSelectedTileCoord(null);
  }

  function handleTileClick(tile: Tile) {
    if (!isMyTurn || gameOver) return;
    const key = coordKey(tile.coord);

    // If it's a valid move target (beetle climbing onto occupied hex)
    if (targetSet.has(key)) {
      if (selectedPieceType) {
        sendAction({ type: 'place', pieceType: selectedPieceType, coord: tile.coord });
        clearSelection();
      } else if (selectedTileCoord) {
        sendAction({ type: 'move', from: selectedTileCoord, to: tile.coord });
        clearSelection();
      }
      return;
    }

    // Select own moveable tile
    if (tile.color === state.myColor && moveableTileSet.has(key)) {
      setSelectedTileCoord(tile.coord);
      setSelectedPieceType(null);
    }
  }

  function handleTargetClick(coord: HexCoord) {
    if (!isMyTurn || gameOver) return;

    if (selectedPieceType) {
      sendAction({ type: 'place', pieceType: selectedPieceType, coord });
      clearSelection();
    } else if (selectedTileCoord) {
      sendAction({ type: 'move', from: selectedTileCoord, to: coord });
      clearSelection();
    }
  }

  function handlePieceTypeSelect(pt: HivePieceType) {
    if (selectedPieceType === pt) {
      setSelectedPieceType(null);
    } else {
      setSelectedPieceType(pt);
      setSelectedTileCoord(null);
    }
  }

  const myInventory = state.myColor === 'white' ? state.whiteInventory : state.blackInventory;
  const availablePieceTypes = useMemo(() => {
    if (!isMyTurn || !state.validActions) return [];
    return state.validActions.placements.map((p) => p.pieceType);
  }, [isMyTurn, state.validActions]);

  // Game over rankings
  const rankings = useMemo(() => {
    if (!gameOver) return null;
    if (state.isDraw) return [players[0].id, players[1].id];
    if (!state.winner) return null;
    const loser = players.find((p) => p.id !== state.winner);
    return loser ? [state.winner, loser.id] : null;
  }, [gameOver, state.isDraw, state.winner, players]);

  const colorLabel: Record<string, string> = {
    white: '白方',
    black: '黑方',
  };

  return (
    <div
      className="min-h-screen text-foreground flex flex-col items-center gap-3 p-3"
      data-testid="game-board"
    >
      {/* Players */}
      <div className="flex flex-wrap gap-3 justify-center w-full max-w-lg">
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
      <div className="text-sm text-muted-foreground font-medium">
        {gameOver
          ? state.isDraw
            ? '平局!'
            : `${playerNames[state.winner ?? ''] ?? state.winner} 获胜!`
          : isMyTurn
            ? `你的回合 (${colorLabel[state.myColor]})`
            : `等待 ${playerNames[state.currentPlayer] ?? state.currentPlayer}...`}
      </div>

      {/* Hex board */}
      <div className="bg-card border-2 border-foreground rounded-[12px] overflow-hidden w-full max-w-lg shadow-[4px_4px_0px_0px_#3d2e1e]">
        {/* biome-ignore lint/a11y/noSvgWithoutTitle: game board SVG */}
        <svg
          viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
          className="w-full"
          aria-label="Hive game board"
          style={{ height: 'min(55vh, 420px)' }}
        >
          {/* Origin dot when empty */}
          {topTiles.length === 0 && validTargets.length === 0 && (
            <circle cx={0} cy={0} r={3} fill="#c4b8a8" opacity={0.5} />
          )}

          {/* Placed tiles */}
          {topTiles.map((t) => {
            const { x, y } = hexToPixel(t.coord);
            const key = coordKey(t.coord);
            const isSelected =
              selectedTileCoord !== null &&
              t.coord.q === selectedTileCoord.q &&
              t.coord.r === selectedTileCoord.r;
            const isMoveable = isMyTurn && t.color === state.myColor && moveableTileSet.has(key);
            const isTarget = targetSet.has(key);

            return (
              <HexTile
                key={key}
                x={x}
                y={y}
                size={HEX_SIZE}
                tile={t}
                selected={isSelected}
                isMoveable={isMoveable}
                onClick={isMoveable || isTarget ? () => handleTileClick(t) : undefined}
              />
            );
          })}

          {/* Valid targets */}
          {validTargets.map((t) => {
            const { x, y } = hexToPixel(t);
            const tKey = coordKey(t);
            const isPlacement = !!selectedPieceType;
            const color = isPlacement ? '#16a34a' : '#2563eb';
            const overlaps = topTiles.some((tile) => coordKey(tile.coord) === tKey);
            if (overlaps) return null;

            return (
              // biome-ignore lint/a11y/useKeyWithClickEvents: SVG game board interactive element
              <g
                key={`target-${tKey}`}
                onClick={() => handleTargetClick(t)}
                style={{ cursor: 'pointer' }}
              >
                <polygon
                  points={hexPoints(x, y, HEX_SIZE * 0.85)}
                  fill={color}
                  opacity={0.15}
                  stroke={color}
                  strokeWidth={2}
                  strokeDasharray="6,3"
                />
                <text
                  x={x}
                  y={y + 1}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={HEX_SIZE * 0.4}
                  fill={color}
                  opacity={0.7}
                  style={{ pointerEvents: 'none', userSelect: 'none' }}
                >
                  +
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Piece inventory / placement panel */}
      {isMyTurn && !gameOver && (
        <div className="w-full max-w-lg bg-card border-2 border-foreground rounded-[12px] p-3 shadow-[4px_4px_0px_0px_#3d2e1e]">
          <div className="text-xs text-muted-foreground font-medium mb-2">选择棋子放置</div>
          <div className="flex flex-wrap gap-2">
            {(['queen', 'spider', 'beetle', 'grasshopper', 'ant'] as HivePieceType[]).map((pt) => {
              const count = myInventory[pt];
              const canPlace = availablePieceTypes.includes(pt);
              const isSelected = selectedPieceType === pt;

              return (
                <button
                  key={pt}
                  type="button"
                  disabled={!canPlace || count === 0}
                  onClick={() => handlePieceTypeSelect(pt)}
                  className={`flex flex-col items-center gap-1 px-3 py-2 rounded-[8px] border-2 min-w-[56px] min-h-[56px] transition-all
                    ${
                      isSelected
                        ? 'bg-[#fef3e0] border-[#d97706] shadow-[2px_2px_0px_0px_#3d2e1e]'
                        : canPlace && count > 0
                          ? 'bg-secondary border-border hover:border-foreground cursor-pointer'
                          : 'bg-muted border-border opacity-40 cursor-not-allowed'
                    }`}
                >
                  <svg viewBox="0 0 24 24" width={24} height={24} aria-hidden="true">
                    {PIECE_ICONS[pt]({ color: state.myColor === 'white' ? '#1a1108' : '#fef3e0' })}
                  </svg>
                  <span className="text-xs font-medium text-foreground">{PIECE_NAMES[pt]}</span>
                  <span className="text-xs text-muted-foreground">{count}</span>
                </button>
              );
            })}
          </div>
          {selectedPieceType && (
            <button
              type="button"
              onClick={clearSelection}
              className="mt-2 text-xs text-muted-foreground underline"
            >
              取消选择
            </button>
          )}
          {selectedTileCoord && (
            <button
              type="button"
              onClick={clearSelection}
              className="mt-2 text-xs text-muted-foreground underline"
            >
              取消选择棋子
            </button>
          )}
          {canPass && (
            <button
              type="button"
              onClick={() => sendAction({ type: 'pass' })}
              className="mt-2 w-full bg-muted border-2 border-border text-foreground py-2 rounded-[8px] font-medium text-sm hover:border-foreground transition-all"
            >
              无子可动，跳过
            </button>
          )}
        </div>
      )}

      {/* Game over modal */}
      {gameOver && rankings && (
        <GameOverModal
          rankings={rankings}
          playerNames={playerNames}
          myId={myId}
          onReturnToRoom={onReturnToRoom}
          onReturnToLobby={onReturnToLobby}
        />
      )}
    </div>
  );
}
