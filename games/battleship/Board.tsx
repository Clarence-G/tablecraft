import { useGameHeaderStatus } from '@repo/game-ui';
import { GameOverModal } from '@repo/game-ui/feedback';
import { PlayerBadge } from '@repo/game-ui/player';
import type { BoardProps } from '@repo/shared';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  type Action,
  FAST_MODE_SHOTS_PER_TURN,
  GRID_SIZE,
  type PlayerView,
  SHIP_COLORS,
  SHIP_NAME_KEYS,
  type ShipDefinition,
  type ShipPlacement,
  buildFleet,
  getAbsolutePositions,
  reconstructPlacements,
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
      return `${SHIP_COLORS.hull.bgClass} border-shadow`;
    case 'hit':
      return `${SHIP_COLORS.hit.bgClass} border-shadow`;
    case 'miss':
      return 'bg-card/40 border-card/30';
    case 'preview':
      // Preview accent uses the royal-blue token (same value as SHIP_COLORS.hull)
      // with 80% alpha + a light highlight border (#93c5fd = pale hull tint,
      // preview-only identity with no token analog).
      return 'bg-royal-blue/80 border-2 border-[#93c5fd] shadow-[0_0_8px_rgba(37,99,235,0.6)]';
    case 'preview-invalid':
      // Pale hit-red tint for invalid placement preview (#fca5a5 = pale hit).
      return 'bg-destructive/60 border-2 border-[#fca5a5] animate-pulse';
    default:
      return 'bg-card/10 border-card/20';
  }
}

function CellContent({ kind }: { kind: CellKind }) {
  if (kind === 'hit') {
    return <span className="text-background font-bold text-xs leading-none">X</span>;
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
      className="inline-grid border-2 border-card/50 shadow-[4px_4px_0px_0px_hsl(var(--shadow))]"
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
      <div className="text-xs font-semibold text-primary-foreground/80 uppercase tracking-wide">
        {label}
      </div>
      <div
        className="inline-grid border-2 border-card/50 shadow-[4px_4px_0px_0px_hsl(var(--shadow))]"
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

function shipLabelKey(fleet: ShipDefinition[], i: number, irregular: boolean): string {
  if (irregular) return `ships.shape.${fleet[i]?.name ?? i}`;
  return SHIP_NAME_KEYS[i] ?? `ships.${fleet[i]?.name ?? i}`;
}

function ShipSelector({
  fleet,
  irregular,
  selectedShipIdx,
  placedShips,
  onSelect,
}: {
  fleet: ShipDefinition[];
  irregular: boolean;
  selectedShipIdx: number | null;
  placedShips: Set<number>;
  onSelect: (idx: number) => void;
}) {
  const { t } = useTranslation('battleship');
  return (
    <div className="flex flex-wrap gap-1.5 justify-center">
      {fleet.map((ship, i) => {
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
            {t(shipLabelKey(fleet, i, irregular), { defaultValue: ship.name })} (
            {ship.offsets.length})
          </button>
        );
      })}
    </div>
  );
}

// ---- Shape SVG Preview ----

/** Fixed size (in cells) so the preview slot never changes dimensions when
 * the user cycles ships. Any shape in the library fits inside 5x5.
 */
export const SHAPE_PREVIEW_CELLS = 5;

/** Render a ship's rotated + optionally mirrored offsets as SVG cells inside a
 * fixed {@link SHAPE_PREVIEW_CELLS}x{@link SHAPE_PREVIEW_CELLS} viewBox. */
function ShapePreview({
  offsets,
  rotation,
  mirror,
}: {
  offsets: [number, number][];
  rotation: number;
  mirror: boolean;
}) {
  const cells = rotateOffsets(offsets, rotation, mirror);
  const rows = cells.length > 0 ? Math.max(...cells.map(([r]) => r)) + 1 : 0;
  const cols = cells.length > 0 ? Math.max(...cells.map(([, c]) => c)) + 1 : 0;
  const N = SHAPE_PREVIEW_CELLS;
  // Center the shape inside the fixed viewBox so short ships don't hug the corner.
  const offR = Math.floor((N - rows) / 2);
  const offC = Math.floor((N - cols) / 2);
  return (
    <svg viewBox={`0 0 ${N} ${N}`} className="w-16 h-16" role="img" aria-label="ship preview">
      {cells.map(([r, c]) => (
        <rect
          key={`${r}-${c}`}
          x={offC + c + 0.05}
          y={offR + r + 0.05}
          width={0.9}
          height={0.9}
          fill={SHIP_COLORS.hull.hex}
          rx={0.1}
        />
      ))}
    </svg>
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
  return (
    <div className="text-xs text-primary-foreground/80">
      <span className="font-medium mr-1">{label}:</span>
      {sunkList.map((sunk, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: ship index is stable
          key={i}
          className={`inline-block w-2 h-2 rounded-full mr-0.5 ${sunk ? SHIP_COLORS.hit.bgClass : SHIP_COLORS.hull.bgClass}`}
          title={sunk ? destroyedLabel : aliveLabel}
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
  pointsDelta,
  ties,
  onReturnToRoom,
  canReturnToRoom,
  onReturnToLobby,
}: BoardProps<PlayerView, Action>) {
  const sendAction = isSending ? () => {} : rawSendAction;
  const fleet = useMemo(() => buildFleet(state.irregularShips), [state.irregularShips]);
  const [selectedShipIdx, setSelectedShipIdx] = useState<number | null>(null);
  const [rotation, setRotation] = useState(0);
  const [mirror, setMirror] = useState(false);
  const [hoverCell, setHoverCell] = useState<{ row: number; col: number } | null>(null);
  const [localGrid, setLocalGrid] = useState<number[]>(() =>
    new Array(GRID_SIZE * GRID_SIZE).fill(0),
  );
  const [placedShips, setPlacedShips] = useState<Set<number>>(new Set());
  /**
   * Per-ship rotation + mirror used when the ship was placed on the local
   * grid, so handleConfirmPlacement can rebuild a faithful ShipPlacement[]
   * with the exact orientation the player chose (including horizontal flip
   * for chiral irregular shapes).
   */
  const [shipOrientations, setShipOrientations] = useState<
    Map<number, { rotation: number; mirror: boolean }>
  >(new Map());
  const { t } = useTranslation('battleship');

  const playerNames = Object.fromEntries(players.map((p) => [p.id, p.name]));
  const isMyTurn = state.currentPlayer === myId;
  const gameOver = state.phase === 'finished';
  useGameHeaderStatus(gameOver ? undefined : state.currentPlayer, state.phase);

  // Keyboard shortcuts during placement: R cycles rotation, F toggles mirror.
  // Gated on placement phase + a ship actually selected so we don't swallow
  // keystrokes while the player is typing in a chat/input.
  const placementActive = state.phase === 'placement' && !state.myPlaced;
  const shipSelected = selectedShipIdx !== null;
  useEffect(() => {
    if (!placementActive || !shipSelected) return;
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        setRotation((r) => (r + 1) % 4);
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        setMirror((m) => !m);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [placementActive, shipSelected]);

  // Compute preview cells for placement grid
  const previewCells = new Set<number>();
  let previewValid = false;

  if (state.phase === 'placement' && !state.myPlaced && selectedShipIdx !== null && hoverCell) {
    const ship = fleet[selectedShipIdx];
    if (ship) {
      const positions = getAbsolutePositions(ship, {
        row: hoverCell.row,
        col: hoverCell.col,
        rotation,
        mirror,
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
    const ship = fleet[selectedShipIdx];
    if (!ship) return;

    const positions = getAbsolutePositions(ship, { row, col, rotation, mirror });
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
    const newOrientations = new Map(shipOrientations);
    newOrientations.set(selectedShipIdx, { rotation, mirror });
    setShipOrientations(newOrientations);
    setSelectedShipIdx(null);
    // Reset orientation for the next selection — a fresh ship starts upright.
    setRotation(0);
    setMirror(false);
  }

  function handleConfirmPlacement() {
    if (placedShips.size !== fleet.length) return;
    const placements = reconstructPlacements(localGrid, shipOrientations);
    sendAction({ type: 'place_ships', placements });
  }

  function handleReset() {
    setLocalGrid(new Array(GRID_SIZE * GRID_SIZE).fill(0));
    setPlacedShips(new Set());
    setShipOrientations(new Map());
    setSelectedShipIdx(null);
    setRotation(0);
    setMirror(false);
  }

  // Offsets for the currently selected ship (used by the SVG preview).
  const selectedShipOffsets =
    selectedShipIdx !== null && fleet[selectedShipIdx] ? fleet[selectedShipIdx].offsets : null;

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-6 rounded-2xl border-2 border-shadow bg-gradient-to-br from-[#1e3a5f] to-[#0f1e33] shadow-[6px_6px_0px_0px_hsl(var(--shadow))]">
      <div
        className="flex-1 text-foreground flex flex-col items-center p-3 sm:p-4 gap-3 w-full bg-warning/5"
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
          <div className="flex flex-col items-center gap-3 w-full max-w-sm sm:max-w-none">
            <div className="text-sm font-semibold text-primary-foreground">{t('deployFleet')}</div>

            {/* Ship Selector */}
            <ShipSelector
              fleet={fleet}
              irregular={state.irregularShips}
              selectedShipIdx={selectedShipIdx}
              placedShips={placedShips}
              onSelect={(idx) => {
                const selecting = idx !== selectedShipIdx;
                setSelectedShipIdx(selecting ? idx : null);
                // Resetting orientation on (de)select keeps the UX predictable —
                // every new selection starts upright, no inherited rotation.
                setRotation(0);
                setMirror(false);
              }}
            />

            {/* Rotation + Preview: fixed side-slot so the grid does not shift.
                On mobile (<sm) the preview stacks BELOW the grid with a min-height
                reservation; on desktop it sits to the RIGHT of the grid. */}
            <div className="flex flex-col sm:flex-row gap-3 items-center sm:items-start justify-center">
              <PlacementGrid
                grid={localGrid}
                previewCells={previewCells}
                previewValid={previewValid}
                onCellClick={handlePlacementClick}
                hoverCell={hoverCell}
                setHoverCell={setHoverCell}
              />
              <div
                className="flex flex-row sm:flex-col items-center gap-2 text-xs text-primary-foreground/80 min-h-[96px] sm:min-h-0 sm:min-w-[140px] sm:pt-1"
                style={{ visibility: selectedShipIdx !== null ? 'visible' : 'hidden' }}
                aria-hidden={selectedShipIdx === null}
              >
                <span>{t('direction')}</span>
                {selectedShipOffsets && (
                  <ShapePreview offsets={selectedShipOffsets} rotation={rotation} mirror={mirror} />
                )}
                <div className="flex flex-row sm:flex-col gap-1">
                  <button
                    type="button"
                    onClick={() => setRotation((r) => (r + 1) % 4)}
                    className="px-2 py-0.5 text-xs bg-secondary text-secondary-foreground border border-border rounded hover:border-foreground/60 transition-colors"
                    title={t('rotateHint')}
                  >
                    {t('rotate')} (R)
                  </button>
                  <button
                    type="button"
                    onClick={() => setMirror((m) => !m)}
                    aria-pressed={mirror}
                    className={`px-2 py-0.5 text-xs border rounded transition-colors ${
                      mirror
                        ? 'bg-primary text-primary-foreground border-foreground'
                        : 'bg-secondary text-secondary-foreground border-border hover:border-foreground/60'
                    }`}
                    title={t('mirrorHint')}
                  >
                    {t('mirror')} (F)
                  </button>
                </div>
              </div>
            </div>

            {/* Controls */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleReset}
                className="px-3 py-1.5 text-xs bg-secondary border-2 border-border rounded shadow-[2px_2px_0px_0px_hsl(var(--foreground))] hover:border-foreground/60 transition-colors"
              >
                {t('reset')}
              </button>
              <button
                type="button"
                disabled={placedShips.size !== fleet.length}
                onClick={handleConfirmPlacement}
                className={`px-4 py-1.5 text-xs font-semibold rounded border-2 shadow-[2px_2px_0px_0px_hsl(var(--foreground))] transition-colors
                ${
                  placedShips.size === fleet.length
                    ? 'bg-primary text-primary-foreground border-foreground hover:opacity-80'
                    : 'bg-muted text-muted-foreground border-border cursor-not-allowed'
                }
              `}
              >
                {t('confirmDeploy')} ({placedShips.size}/{fleet.length})
              </button>
            </div>
          </div>
        )}

        {/* Placement: waiting for opponent */}
        {state.phase === 'placement' && state.myPlaced && (
          <div className="bg-card border-2 border-border rounded shadow-[4px_4px_0px_0px_hsl(var(--foreground))] px-6 py-4 text-center">
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

            {/* Fast-mode HUD: shots remaining + end-turn early */}
            {state.fastMode && isMyTurn && !gameOver && (
              <div className="flex items-center gap-3 text-xs font-medium text-primary-foreground">
                <span className="px-2 py-1 rounded border border-card/40 bg-card/10">
                  {t('shotsRemaining', { count: state.shotsRemaining })}
                </span>
                <button
                  type="button"
                  onClick={() => sendAction({ type: 'end_turn' })}
                  disabled={state.shotsRemaining === FAST_MODE_SHOTS_PER_TURN}
                  className="px-3 py-1 text-xs font-semibold rounded border-2 border-foreground bg-primary text-primary-foreground shadow-[2px_2px_0px_0px_hsl(var(--shadow))] hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
                >
                  {t('endTurn')}
                </button>
              </div>
            )}

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
                  const turnDone = state.shotsRemaining <= 1;
                  const nextRemaining = turnDone
                    ? state.fastMode
                      ? FAST_MODE_SHOTS_PER_TURN
                      : 1
                    : state.shotsRemaining - 1;
                  const optimistic: PlayerView = {
                    ...state,
                    myShots: nextShots,
                    currentPlayer: turnDone && opponent ? opponent.id : state.currentPlayer,
                    shotsRemaining: nextRemaining,
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
            pointsDelta={pointsDelta}
            ties={ties}
            onReturnToRoom={onReturnToRoom}
            canReturnToRoom={canReturnToRoom}
            onReturnToLobby={onReturnToLobby}
          />
        )}
      </div>
    </div>
  );
}
