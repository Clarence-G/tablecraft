import { GameOverModal } from '@repo/game-ui/feedback';
import { PlayerBadge } from '@repo/game-ui/player';
import type { BoardProps } from '@repo/shared';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Action, HexCoord, HivePieceType, PlayerView, Tile } from './shared';
import { HEX_SIZE, coordKey, hexToPixel } from './shared';

// ============ Piece Icons ============

const PIECE_ICON_PATHS: Record<HivePieceType, string> = {
  queen: '/game-icons/hive/bee.svg',
  spider: '/game-icons/hive/spider.svg',
  beetle: '/game-icons/hive/beetle.svg',
  grasshopper: '/game-icons/hive/grasshopper.svg',
  ant: '/game-icons/hive/ant.svg',
};

const PIECE_NAME_KEYS: Record<HivePieceType, string> = {
  queen: 'pieceQueen',
  spider: 'pieceSpider',
  beetle: 'pieceBeetle',
  grasshopper: 'pieceGrasshopper',
  ant: 'pieceAnt',
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
  const isLightIcon = !isWhite;
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
      <image
        href={PIECE_ICON_PATHS[tile.type]}
        x={x - 12 * iconScale}
        y={y - 12 * iconScale}
        width={24 * iconScale}
        height={24 * iconScale}
        style={{
          pointerEvents: 'none',
          filter: isLightIcon ? 'invert(1)' : 'none',
        }}
      />
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
  const { t } = useTranslation('hive');
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
    white: t('white'),
    black: t('black'),
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
            ? t('draw')
            : `${playerNames[state.winner ?? ''] ?? state.winner} ${t('won')}`
          : isMyTurn
            ? `${t('yourTurn')} (${colorLabel[state.myColor]})`
            : `${t('waiting')} ${playerNames[state.currentPlayer] ?? state.currentPlayer}...`}
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
          <div className="text-xs text-muted-foreground font-medium mb-2">{t('selectPiece')}</div>
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
                  <svg viewBox="0 0 512 512" width={24} height={24} aria-hidden="true">
                    <image
                      href={PIECE_ICON_PATHS[pt]}
                      width={512}
                      height={512}
                      style={{
                        filter: state.myColor === 'white' ? 'none' : 'invert(1)',
                      }}
                    />
                  </svg>
                  <span className="text-xs font-medium text-foreground">
                    {t(PIECE_NAME_KEYS[pt])}
                  </span>
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
              {t('deselect')}
            </button>
          )}
          {selectedTileCoord && (
            <button
              type="button"
              onClick={clearSelection}
              className="mt-2 text-xs text-muted-foreground underline"
            >
              {t('deselectPiece')}
            </button>
          )}
          {canPass && (
            <button
              type="button"
              onClick={() => sendAction({ type: 'pass' })}
              className="mt-2 w-full bg-muted border-2 border-border text-foreground py-2 rounded-[8px] font-medium text-sm hover:border-foreground transition-all"
            >
              {t('skipTurn')}
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
