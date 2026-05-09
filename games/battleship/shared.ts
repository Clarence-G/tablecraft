import type { GameMeta } from '@repo/shared';
import { z } from 'zod';
import { getShape } from './shapes';

export const BattleshipConfigSchema = z.object({
  fastMode: z.boolean().default(false),
  irregularShips: z.boolean().default(false),
});
export type BattleshipConfig = z.infer<typeof BattleshipConfigSchema>;
export const BATTLESHIP_DEFAULT_CONFIG: BattleshipConfig = {
  fastMode: false,
  irregularShips: false,
};
export const FAST_MODE_SHOTS_PER_TURN = 5;

export const meta: GameMeta = {
  id: 'battleship',
  name: '战舰',
  description: '在10×10海域部署舰队，找出并击沉对手的所有舰船',
  minPlayers: 2,
  maxPlayers: 2,
  tags: ['策略', '休闲'],
  icon: 'battleship',
  estimatedMinutes: 25,
  configSchema: BattleshipConfigSchema,
  defaultConfig: BATTLESHIP_DEFAULT_CONFIG,
  scene: {
    surface: { color: '#1b3a5c', texture: 'paper', accent: '#8bb8d8' },
    ambience: { type: 'ambient', warmth: 'cool', intensity: 0.28 },
  },
  rules:
    '两人各自在 10x10 海域秘密部署 5 艘舰船，然后轮流射击对方海域，先击沉对手所有舰船的玩家获胜。',
  agentRules: `10x10 grid (row=0-9, col=0-9). Two phases: placement then firing.

Ships (5 total): Carrier(5), Battleship(4), Cruiser(3), Submarine(3), Destroyer(2).
Ships must not overlap or go out of bounds. Rotation 0-3 = 0/90/180/270 degrees.

Actions:
  Placement phase:
    { "type": "place_ships", "placements": [ { "shipIndex": <0-4>, "row": <0-9>, "col": <0-9>, "rotation": <0-3> }, ... ] }
    Must place all 5 ships at once. shipIndex: 0=Carrier, 1=Battleship, 2=Cruiser, 3=Submarine, 4=Destroyer.

  Firing phase:
    { "type": "fire", "row": <int 0-9>, "col": <int 0-9> }
    { "type": "end_turn" } — only in fastMode; pass turn early before using all shots.

PlayerView fields:
  phase: "placement"|"playing"|"finished"
  currentPlayer: string
  shotsRemaining: number — shots left this turn (1 in classic, up to 5 in fastMode)
  fastMode: boolean — whether fast mode (5 shots per turn) is active
  myGrid: number[] — 100 cells, 0=water, 1-5=ship index
  myShots: number[] — your shots on opponent grid, 0=unknown, 1=miss, 2=hit
  opponentShots: number[] — opponent's shots on your grid
  myShipsSunk: boolean[] — 5 booleans, your ship sunk status
  opponentShipsSunk: boolean[] — 5 booleans, opponent ship sunk status
  myPlaced: boolean — whether you placed ships
  opponentPlaced: boolean — whether opponent placed ships
  winner: string|null

Grid indexing: index = row * 10 + col.
Win condition: sink all 5 opponent ships.
Invalid moves: firing a cell already fired at, firing when not your turn, end_turn when fastMode is off.`,
};

export const GRID_SIZE = 10;
export const TOTAL_CELLS = GRID_SIZE * GRID_SIZE;

// Ship hull, hit, and water (miss) colors are canonical game-mechanic
// identities, not theme tokens. A hull stays hard-blue across themes; a
// hit stays red. Intentionally hex literal so theme swaps cannot
// inadvertently break naval-cell recognition.
//
// `bgClass` is a Tailwind arbitrary-value class string so Tailwind's JIT
// can pick it up from this source file. `miss` uses a card-surface token
// because water is ambient fleet-grid background, not a game identity.
export const SHIP_COLORS = {
  hull: { bgClass: 'bg-[#2563eb]', hex: '#2563eb' },
  hit: { bgClass: 'bg-[#d94040]', hex: '#d94040' },
  miss: { bgClass: 'bg-card/40', hex: 'transparent' },
} as const;

export interface ShipDefinition {
  name: string;
  offsets: [number, number][];
}

export const CLASSIC_SHIPS: ShipDefinition[] = [
  {
    name: 'Carrier',
    offsets: [
      [0, 0],
      [0, 1],
      [0, 2],
      [0, 3],
      [0, 4],
    ],
  },
  {
    name: 'Battleship',
    offsets: [
      [0, 0],
      [0, 1],
      [0, 2],
      [0, 3],
    ],
  },
  {
    name: 'Cruiser',
    offsets: [
      [0, 0],
      [0, 1],
      [0, 2],
    ],
  },
  {
    name: 'Submarine',
    offsets: [
      [0, 0],
      [0, 1],
      [0, 2],
    ],
  },
  {
    name: 'Destroyer',
    offsets: [
      [0, 0],
      [0, 1],
    ],
  },
];

export const SHIP_NAMES_ZH: string[] = ['航母', '战列舰', '巡洋舰', '潜艇', '驱逐舰'];

/**
 * Shape ids (from `SHIP_SHAPES` in `./shapes.ts`) used when the host
 * enables `irregularShips`. The selected entries total 17 cells —
 * matching the classic fleet — so hit counts stay balanced:
 *   U (5) + Z (4) + L (4) + T (4) = 17
 * Only non-straight polyominoes are listed; a "straight" ship has
 * every offset on the same row or column after normalization.
 */
export const IRREGULAR_FLEET: readonly string[] = ['U', 'Z', 'L', 'T'];

export function buildIrregularFleet(): ShipDefinition[] {
  return IRREGULAR_FLEET.map((id) => {
    const shape = getShape(id);
    if (!shape) throw new Error(`Unknown ship shape: ${id}`);
    return {
      name: id,
      offsets: shape.cells.map(([r, c]) => [r, c] as [number, number]),
    };
  });
}

export function buildFleet(irregularShips: boolean): ShipDefinition[] {
  return irregularShips ? buildIrregularFleet() : CLASSIC_SHIPS;
}

/**
 * i18n keys matching the order of CLASSIC_SHIPS. Look up via
 * `t('ships.<key>')` to get the localized ship name. The SHIP_NAMES_ZH
 * array is kept for backward compatibility — agents consuming shared.ts
 * directly (e.g. in tests) still get hardcoded zh strings, but all
 * user-facing UI should go through i18n.
 */
export const SHIP_NAME_KEYS: string[] = [
  'ships.carrier',
  'ships.battleship',
  'ships.cruiser',
  'ships.submarine',
  'ships.destroyer',
];

function rotate90(offset: [number, number]): [number, number] {
  return [offset[1], -offset[0]];
}

function normalizeOffsets(offsets: [number, number][]): [number, number][] {
  const minR = Math.min(...offsets.map((o) => o[0]));
  const minC = Math.min(...offsets.map((o) => o[1]));
  return offsets.map((o) => [o[0] - minR, o[1] - minC]);
}

export function rotateOffsets(
  offsets: [number, number][],
  rotation: number,
  mirror = false,
): [number, number][] {
  let result = offsets.map((o) => [...o] as [number, number]);
  if (mirror) {
    // Flip across the vertical axis: (r, c) -> (r, -c). Normalized below.
    result = result.map(([r, c]) => [r, -c] as [number, number]);
  }
  const steps = ((rotation % 4) + 4) % 4;
  for (let i = 0; i < steps; i++) {
    result = result.map(rotate90);
  }
  return normalizeOffsets(result);
}

export function getAbsolutePositions(
  ship: ShipDefinition,
  placement: { row: number; col: number; rotation: number; mirror?: boolean },
): [number, number][] {
  const rotated = rotateOffsets(ship.offsets, placement.rotation, placement.mirror ?? false);
  return rotated.map((o) => [placement.row + o[0], placement.col + o[1]]);
}

export function toIndex(row: number, col: number): number {
  return row * GRID_SIZE + col;
}

function positionsInBounds(positions: [number, number][]): boolean {
  return positions.every(([r, c]) => r >= 0 && r < GRID_SIZE && c >= 0 && c < GRID_SIZE);
}

export interface ShipPlacement {
  shipIndex: number;
  row: number;
  col: number;
  rotation: number;
  /** Optional horizontal flip applied before rotation. Used by irregular
   * (chiral) shapes; classic straight ships are unaffected by mirroring. */
  mirror?: boolean;
}

export function validateShipPlacements(
  placements: ShipPlacement[],
  fleet: ShipDefinition[] = CLASSIC_SHIPS,
): boolean {
  if (placements.length !== fleet.length) return false;

  const usedIndices = new Set<number>();
  for (const p of placements) {
    if (p.shipIndex < 0 || p.shipIndex >= fleet.length) return false;
    if (usedIndices.has(p.shipIndex)) return false;
    usedIndices.add(p.shipIndex);
  }

  const occupied = new Set<number>();
  for (const p of placements) {
    const ship = fleet[p.shipIndex];
    if (!ship) return false;
    const positions = getAbsolutePositions(ship, p);
    if (!positionsInBounds(positions)) return false;
    for (const [r, c] of positions) {
      const idx = toIndex(r, c);
      if (occupied.has(idx)) return false;
      occupied.add(idx);
    }
  }

  return true;
}

export function placeShipsOnGrid(
  placements: ShipPlacement[],
  fleet: ShipDefinition[] = CLASSIC_SHIPS,
): number[] | null {
  if (!validateShipPlacements(placements, fleet)) return null;

  const grid = new Array(TOTAL_CELLS).fill(0);
  for (const p of placements) {
    const ship = fleet[p.shipIndex];
    if (!ship) return null;
    const positions = getAbsolutePositions(ship, p);
    const shipValue = p.shipIndex + 1;
    for (const [r, c] of positions) {
      grid[toIndex(r, c)] = shipValue;
    }
  }
  return grid;
}

export function checkShipSunk(grid: number[], shots: number[], shipValue: number): boolean {
  for (let i = 0; i < TOTAL_CELLS; i++) {
    if (grid[i] === shipValue && shots[i] !== 2) return false;
  }
  return true;
}

export function checkAllShipsSunk(
  grid: number[],
  shots: number[],
  shipCount: number = CLASSIC_SHIPS.length,
): boolean {
  for (let v = 1; v <= shipCount; v++) {
    if (!checkShipSunk(grid, shots, v)) return false;
  }
  return true;
}

export type Phase = 'placement' | 'playing' | 'finished';

export interface PlayerView {
  myGrid: number[];
  myShots: number[];
  opponentShots: number[];
  myShipsSunk: boolean[];
  opponentShipsSunk: boolean[];
  phase: Phase;
  currentPlayer: string;
  myPlaced: boolean;
  opponentPlaced: boolean;
  winner: string | null;
  /** Shots the current player still has this turn (1 in classic, 1..5 in fastMode). */
  shotsRemaining: number;
  /** Whether the room was started with the fastMode option. */
  fastMode: boolean;
  /** Whether the room was started with the irregularShips option. */
  irregularShips: boolean;
}

const ShipPlacementSchema = z.object({
  shipIndex: z.number().int().min(0).max(4),
  row: z.number().int().min(0).max(9),
  col: z.number().int().min(0).max(9),
  rotation: z.number().int().min(0).max(3),
  mirror: z.boolean().optional(),
});

export const ActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('place_ships'),
    // Length is validated against the room's fleet inside logic (fleet size
    // varies: 5 for classic, 4 for irregular). Schema enforces 1..5 max.
    placements: z.array(ShipPlacementSchema).min(1).max(5),
  }),
  z.object({
    type: z.literal('fire'),
    row: z.number().int().min(0).max(9),
    col: z.number().int().min(0).max(9),
  }),
  z.object({
    type: z.literal('end_turn'),
  }),
]);

export type Action = z.infer<typeof ActionSchema>;
