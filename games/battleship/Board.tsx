import { useGameHeaderStatus } from '@repo/game-ui';
import { GameOverModal } from '@repo/game-ui/feedback';
import { PlayerBadge } from '@repo/game-ui/player';
import type { BoardProps } from '@repo/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  type Action,
  CLASSIC_SHIPS,
  GRID_SIZE,
  type PlayerView,
  SHIP_NAME_KEYS,
  type ShipPlacement,
  getAbsolutePositions,
  rotateOffsets,
  toIndex,
} from './shared';

// ---- Grid Cell ----

type CellKind = 'water' | 'ship' | 'hit' | 'miss' | 'preview' | 'preview-invalid';

function cellClass(kind: CellKind): string {
  switch (kind) {
    case 'water':
      return 'bg-card/10 border-card/20';
    case 'ship':
      return 'bg-[#2563eb] border-[#1a1108]';
    case 'hit':
      return 'bg-[#d94040] border-[#1a1108]';
    case 'miss':
      return 'bg-card/40 border-card/30';
    case 'preview':
      return 'bg-[#2563eb]/80 border-2 border-[#93c5fd] shadow-[0_0_8px_rgba(37,99,235,0.6)]';
    case 'preview-invalid':
      return 'bg-[#d94040]/60 border-2 border-[#fca5a5] animate-pulse';
    default:
      return 'bg-card/10 border-card/20';
  }
}

function CellContent({ kind }: { kind: CellKind }) {
  if (kind === 'hit') {
    return <span className="text-[#fef3e0] font-bold text-xs leading-none">X</span>;
  }
  if (kind === 'miss') {
    return <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 inline-block" />;
  }
  return null;
}

// ---- Placement Grid ----

interface PlacementGridProps {
  grid: number[];
  previewCells: Set<number>;
  previewValid: boolean;
  onCellClick: (row: number, col: number) => void;
  hoverCell: { row: number; col: number } | null;
  setHoverCell: (cell: { row: number; col: number } | null) => void;
}

function PlacementGrid({
  grid,
  previewCells,
  previewValid,
  onCellClick,
  hoverCell: _hoverCell,
  setHoverCell,
}: PlacementGridProps) {
  return (
    <div
      className="inline-grid border-2 border-card/50 shadow-[4px_4px_0px_0px_#1a1108]"
      style={{ gridTemplateColumns: `repeat(${GRID_SIZE}, auto)` }}
    >
      {Array.from({ length: GRID_SIZE * GRID_SIZE }).map((_, idx) => {
        const row = Math.floor(idx / GRID_SIZE);
        const col = idx % GRID_SIZE;
        const hasShip = grid[idx] > 0;
        const inPreview = previewCells.has(idx);

        let kind: CellKind = hasShip ? 'ship' : 'water';
        if (inPreview) {
          kind = previewValid ? 'preview' : 'preview-invalid';
        }

        return (
          <button
            // biome-ignore lint/suspicious/noArrayIndexKey: grid cells use stable index
            key={idx}
            type="button"
            className={`w-7 h-7 sm:w-8 sm:h-8 border flex items-center justify-center transition-colors ${cellClass(kind)}`}
            onClick={() => onCellClick(row, col)}
            onMouseEnter={() => setHoverCell({ row, col })}
            onMouseLeave={() => setHoverCell(null)}
          >
            <CellContent kind={kind} />
          </button>
        );
      })}
    </div>
  );
}

// ---- Battle Grid ----

interface BattleGridProps {
  label: string;
  shipGrid: number[];
  shotsGrid: number[];
  clickable: boolean;
  onCellClick?: (row: number, col: number) => void;
}

function BattleGrid({ label, shipGrid, shotsGrid, clickable, onCellClick }: BattleGridProps) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        {label}
      </div>
      <div
        className="inline-grid border-2 border-card/50 shadow-[4px_4px_0px_0px_#1a1108]"
        style={{ gridTemplateColumns: `repeat(${GRID_SIZE}, auto)` }}
      >
        {Array.from({ length: GRID_SIZE * GRID_SIZE }).map((_, idx) => {
          const row = Math.floor(idx / GRID_SIZE);
          const col = idx % GRID_SIZE;
          const shot = shotsGrid[idx];
          const ship = shipGrid[idx];

          let kind: CellKind;
          if (shot === 2) {
            kind = 'hit';
          } else if (shot === 1) {
            kind = 'miss';
          } else if (ship > 0) {
            kind = 'ship';
          } else {
            kind = 'water';
          }

          const isClickable = clickable && shot === 0;

          return (
            <button
              // biome-ignore lint/suspicious/noArrayIndexKey: grid cells use stable index
              key={idx}
              type="button"
              disabled={!isClickable}
              className={`w-6 h-6 sm:w-7 sm:h-7 border flex items-center justify-center transition-colors
                ${cellClass(kind)}
                ${isClickable ? 'cursor-pointer hover:opacity-70' : 'cursor-default'}
              `}
              onClick={() => isClickable && onCellClick?.(row, col)}
            >
              <CellContent kind={kind} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---- Ship Selector ----

function ShipSelector({
  selectedShipIdx,
  placedShips,
  onSelect,
}: {
  selectedShipIdx: number | null;
  placedShips: Set<number>;
  onSelect: (idx: number) => void;
}) {
  const { t } = useTranslation('battleship');
  return (
    <div className="flex flex-wrap gap-1.5 justify-center">
      {CLASSIC_SHIPS.map((ship, i) => {
        const placed = placedShips.has(i);
        const selected = selectedShipIdx === i;
        return (
          <button
            // biome-ignore lint/suspicious/noArrayIndexKey: ship index is stable
            key={i}
            type="button"
            disabled={placed}
            onClick={() => onSelect(i)}
            className={`px-2 py-1 rounded text-xs font-medium border-2 transition-all
              ${placed ? 'opacity-40 cursor-not-allowed border-border bg-muted text-muted-foreground' : ''}
              ${selected && !placed ? 'border-foreground bg-primary text-primary-foreground' : ''}
              ${!selected && !placed ? 'border-border bg-card text-foreground hover:border-foreground/60' : ''}
            `}
          >
            {t(SHIP_NAME_KEYS[i]!)} ({ship.offsets.length})
          </button>
        );
      })}
    </div>
  );
}

// ---- Sunk Ship Indicators ----

function SunkIndicator({
  sunkList,
  label,
  destroyedLabel,
  aliveLabel,
}: {
  sunkList: boolean[];
  label: string;
  destroyedLabel: string;
  aliveLabel: string;
}) {
  const { t } = useTranslation('battleship');
  return (
    <div className="text-xs text-muted-foreground">
      <span className="font-medium mr-1">{label}:</span>
      {sunkList.map((sunk, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: ship index is stable
          key={i}
          className={`inline-block w-2 h-2 rounded-full mr-0.5 ${sunk ? 'bg-[#d94040]' : 'bg-[#2563eb]'}`}
          title={`${t(SHIP_NAME_KEYS[i]!)} ${sunk ? destroyedLabel : aliveLabel}`}
        />
      ))}
    </div>
  );
}

// ---- Main Board ----

export function Board({
  state,
  myId,
  players,
  sendAction: rawSendAction,
  isSending,
}: BoardProps<PlayerView, Action>) {
  const sendAction = isSending ? () => {} : rawSendAction;
  const [selectedShipIdx, setSelectedShipIdx] = useState<number | null>(null);
  const [rotation, setRotation] = useState(0);
  const [hoverCell, setHoverCell] = useState<{ row: number; col: number } | null>(null);
  const [localGrid, setLocalGrid] = useState<number[]>(() =>
    new Array(GRID_SIZE * GRID_SIZE).fill(0),
  );
  const [placedShips, setPlacedShips] = useState<Set<number>>(new Set());
  /**
   * Per-ship rotation used when it was placed on the local grid. Needed so
   * handleConfirmPlacement can rebuild a faithful ShipPlacement[] with the
   * rotation the player actually chose, instead of always sending rotation=0
   * (which made `GET /api/rooms/:id` return bogus rotations for agents).
   */
  const [shipRotations, setShipRotations] = useState<Map<number, number>>(new Map());
  const { t } = useTranslation('battleship');

  const playerNames = Object.fromEntries(players.map((p) => [p.id, p.name]));
  const isMyTurn = state.currentPlayer === myId;
  const gameOver = state.phase === 'finished';
  useGameHeaderStatus(gameOver ? undefined : state.currentPlayer);

  // Compute preview cells for placement grid
  const previewCells = new Set<number>();
  let previewValid = false;

  if (state.phase === 'placement' && !state.myPlaced && selectedShipIdx !== null && hoverCell) {
    const ship = CLASSIC_SHIPS[selectedShipIdx];
    if (ship) {
      const positions = getAbsolutePositions(ship, {
        row: hoverCell.row,
        col: hoverCell.col,
        rotation,
      });
      const inBounds = positions.every(
        ([r, c]) => r >= 0 && r < GRID_SIZE && c >= 0 && c < GRID_SIZE,
      );
      const noOverlap = positions.every(([r, c]) => localGrid[toIndex(r, c)] === 0);
      previewValid = inBounds && noOverlap;
      for (const [r, c] of positions) {
        if (r >= 0 && r < GRID_SIZE && c >= 0 && c < GRID_SIZE) {
          previewCells.add(toIndex(r, c));
        }
      }
    }
  }

  function handlePlacementClick(row: number, col: number) {
    if (selectedShipIdx === null) return;
    const ship = CLASSIC_SHIPS[selectedShipIdx];
    if (!ship) return;

    const positions = getAbsolutePositions(ship, { row, col, rotation });
    const inBounds = positions.every(
      ([r, c]) => r >= 0 && r < GRID_SIZE && c >= 0 && c < GRID_SIZE,
    );
    const noOverlap = positions.every(([r, c]) => localGrid[toIndex(r, c)] === 0);
    if (!inBounds || !noOverlap) return;

    const newGrid = [...localGrid];
    const shipValue = selectedShipIdx + 1;
    for (const [r, c] of positions) {
      newGrid[toIndex(r, c)] = shipValue;
    }
    setLocalGrid(newGrid);

    const newPlaced = new Set(placedShips);
    newPlaced.add(selectedShipIdx);
    setPlacedShips(newPlaced);
    const newRotations = new Map(shipRotations);
    newRotations.set(selectedShipIdx, rotation);
    setShipRotations(newRotations);
    setSelectedShipIdx(null);
  }

  function handleConfirmPlacement() {
    if (placedShips.size !== CLASSIC_SHIPS.length) return;

    // Reconstruct placements from localGrid.
    // We stored shipValue = shipIndex+1 in the grid; the anchor is the FIRST
    // grid cell (in row-major scan order) matching that ship's value. But:
    // the anchor cell must correspond to offset (0, 0) of the ship AFTER
    // rotation normalization. Since rotateOffsets() in shared.ts normalizes
    // so that (minR, minC) = (0, 0), the top-left bounding cell in localGrid
    // IS the anchor for that rotation. So a naive "first occurrence in
    // row-major order" scan correctly finds the anchor, provided we use the
    // rotation that was applied at placement time.
    const placementMap = new Map<number, ShipPlacement>();
    for (let idx = 0; idx < localGrid.length; idx++) {
      const v = localGrid[idx];
      if (v > 0 && !placementMap.has(v)) {
        const row = Math.floor(idx / GRID_SIZE);
        const col = idx % GRID_SIZE;
        const shipIndex = v - 1;
        // shipRotations is guaranteed populated because handlePlacementClick
        // writes to it on every successful placement, and placedShips.size
        // check above ensures every ship was placed.
        const shipRotation = shipRotations.get(shipIndex) ?? 0;
        placementMap.set(v, { shipIndex, row, col, rotation: shipRotation });
      }
    }

    const placements = Array.from(placementMap.values());
    sendAction({ type: 'place_ships', placements });
  }

  function handleReset() {
    setLocalGrid(new Array(GRID_SIZE * GRID_SIZE).fill(0));
    setPlacedShips(new Set());
    setShipRotations(new Map());
    setSelectedShipIdx(null);
  }

  // Rotation preview dimensions
  const rotatedOffsets =
    selectedShipIdx !== null && CLASSIC_SHIPS[selectedShipIdx]
      ? rotateOffsets(CLASSIC_SHIPS[selectedShipIdx].offsets, rotation)
      : [];
  const shipPreviewRows =
    rotatedOffsets.length > 0 ? Math.max(...rotatedOffsets.map(([r]) => r)) + 1 : 0;
  const shipPreviewCols =
    rotatedOffsets.length > 0 ? Math.max(...rotatedOffsets.map(([, c]) => c)) + 1 : 0;

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-6 rounded-2xl border-2 border-[#1a1108] bg-gradient-to-br from-[#1e3a5f] to-[#0f1e33] shadow-[6px_6px_0px_0px_#1a1108]">
      <div
        className="flex-1 text-foreground flex flex-col items-center p-3 sm:p-4 gap-3 w-full bg-[#fef3e0]/5"
        data-testid="game-board"
      >
      {/* Players */}
      <div className="flex gap-3 flex-wrap justify-center">
        {players.map((p) => (
          <PlayerBadge
            key={p.id}
            player={p}
            isCurrentTurn={state.phase === 'playing' && state.currentPlayer === p.id}
            isMe={p.id === myId}
          />
        ))}
      </div>

      {/* Phase: Placement */}
      {state.phase === 'placement' && !state.myPlaced && (
        <div className="flex flex-col items-center gap-3 w-full max-w-sm">
          <div className="text-sm font-semibold text-foreground">{t('deployFleet')}</div>

          {/* Ship Selector */}
          <ShipSelector
            selectedShipIdx={selectedShipIdx}
            placedShips={placedShips}
            onSelect={(idx) => {
              setSelectedShipIdx(idx === selectedShipIdx ? null : idx);
            }}
          />

          {/* Rotation + Preview */}
          {selectedShipIdx !== null && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{t('direction')}</span>
              {rotatedOffsets.length > 0 && (
                <div
                  className="inline-grid gap-px"
                  style={{
                    gridTemplateRows: `repeat(${shipPreviewRows}, 8px)`,
                    gridTemplateColumns: `repeat(${shipPreviewCols}, 8px)`,
                  }}
                >
                  {Array.from({ length: shipPreviewRows * shipPreviewCols }).map((_, idx) => {
                    const r = Math.floor(idx / shipPreviewCols);
                    const c = idx % shipPreviewCols;
                    const filled = rotatedOffsets.some(([or, oc]) => or === r && oc === c);
                    return (
                      <div
                        // biome-ignore lint/suspicious/noArrayIndexKey: preview cells use stable index
                        key={idx}
                        className={filled ? 'bg-[#2563eb] rounded-sm' : ''}
                      />
                    );
                  })}
                </div>
              )}
              <button
                type="button"
                onClick={() => setRotation((r) => (r + 1) % 4)}
                className="px-2 py-0.5 text-xs bg-secondary border border-border rounded hover:border-foreground/60 transition-colors"
              >
                {t('rotate')}
              </button>
            </div>
          )}

          <PlacementGrid
            grid={localGrid}
            previewCells={previewCells}
            previewValid={previewValid}
            onCellClick={handlePlacementClick}
            hoverCell={hoverCell}
            setHoverCell={setHoverCell}
          />

          {/* Controls */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleReset}
              className="px-3 py-1.5 text-xs bg-secondary border-2 border-border rounded shadow-[2px_2px_0px_0px_#3d2e1e] hover:border-foreground/60 transition-colors"
            >
              {t('reset')}
            </button>
            <button
              type="button"
              disabled={placedShips.size !== CLASSIC_SHIPS.length}
              onClick={handleConfirmPlacement}
              className={`px-4 py-1.5 text-xs font-semibold rounded border-2 shadow-[2px_2px_0px_0px_#3d2e1e] transition-colors
                ${
                  placedShips.size === CLASSIC_SHIPS.length
                    ? 'bg-primary text-primary-foreground border-foreground hover:opacity-80'
                    : 'bg-muted text-muted-foreground border-border cursor-not-allowed'
                }
              `}
            >
              {t('confirmDeploy')} ({placedShips.size}/{CLASSIC_SHIPS.length})
            </button>
          </div>
        </div>
      )}

      {/* Placement: waiting for opponent */}
      {state.phase === 'placement' && state.myPlaced && (
        <div className="bg-card border-2 border-border rounded shadow-[4px_4px_0px_0px_#3d2e1e] px-6 py-4 text-center">
          <div className="text-sm font-semibold text-foreground mb-1">{t('fleetDeployed')}</div>
          <div className="text-xs text-muted-foreground">{t('waitingOpponent')}</div>
        </div>
      )}

      {/* Phase: Playing */}
      {state.phase === 'playing' && (
        <div className="flex flex-col items-center gap-3 w-full">
          {/* Sunk indicators */}
          <div className="flex gap-4 text-xs">
            <SunkIndicator
              sunkList={state.opponentShipsSunk}
              label={t('sunk')}
              destroyedLabel={t('destroyed')}
              aliveLabel={t('alive')}
            />
            <SunkIndicator
              sunkList={state.myShipsSunk}
              label={t('ourLosses')}
              destroyedLabel={t('destroyed')}
              aliveLabel={t('alive')}
            />
          </div>

          {/* Grids */}
          <div className="flex flex-wrap gap-4 justify-center">
            <BattleGrid
              label={t('enemyWaters')}
              shipGrid={new Array(GRID_SIZE * GRID_SIZE).fill(0)}
              shotsGrid={state.myShots}
              clickable={isMyTurn && !gameOver}
              onCellClick={(row, col) => {
                // Optimistic fire: assume hit (2). Feels rewarding; a miss
                // visibly corrects ~one RTT later when the real view arrives.
                const opponent = players.find((p) => p.id !== myId);
                const nextShots = [...state.myShots];
                nextShots[toIndex(row, col)] = 2;
                const optimistic: PlayerView = {
                  ...state,
                  myShots: nextShots,
                  currentPlayer: opponent ? opponent.id : state.currentPlayer,
                };
                sendAction({ type: 'fire', row, col }, optimistic);
              }}
            />
            <BattleGrid
              label={t('ourFleet')}
              shipGrid={state.myGrid}
              shotsGrid={state.opponentShots}
              clickable={false}
            />
          </div>
        </div>
      )}

      {/* Game Over Modal */}
      {gameOver && state.winner && (
        <GameOverModal
          rankings={[
            state.winner,
            ...players.filter((p) => p.id !== state.winner).map((p) => p.id),
          ]}
          playerNames={playerNames}
          myId={myId}
        />
      )}
      </div>
    </div>
  );
}
