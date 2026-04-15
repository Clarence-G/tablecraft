import type { GameMeta } from '@repo/shared';
import { z } from 'zod';

export const meta: GameMeta = {
  id: 'battleship',
  name: '战舰',
  description: '在10×10海域部署舰队，找出并击沉对手的所有舰船',
  minPlayers: 2,
  maxPlayers: 2,
  tags: ['策略', '休闲'],
  icon: 'Crosshair',
  estimatedMinutes: 25,
};

export const GRID_SIZE = 10;
export const TOTAL_CELLS = GRID_SIZE * GRID_SIZE;

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

function rotate90(offset: [number, number]): [number, number] {
  return [offset[1], -offset[0]];
}

function normalizeOffsets(offsets: [number, number][]): [number, number][] {
  const minR = Math.min(...offsets.map((o) => o[0]));
  const minC = Math.min(...offsets.map((o) => o[1]));
  return offsets.map((o) => [o[0] - minR, o[1] - minC]);
}

export function rotateOffsets(offsets: [number, number][], rotation: number): [number, number][] {
  let result = offsets.map((o) => [...o] as [number, number]);
  const steps = ((rotation % 4) + 4) % 4;
  for (let i = 0; i < steps; i++) {
    result = result.map(rotate90);
  }
  return normalizeOffsets(result);
}

export function getAbsolutePositions(
  ship: ShipDefinition,
  placement: { row: number; col: number; rotation: number },
): [number, number][] {
  const rotated = rotateOffsets(ship.offsets, placement.rotation);
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
}

export function validateShipPlacements(placements: ShipPlacement[]): boolean {
  if (placements.length !== CLASSIC_SHIPS.length) return false;

  const usedIndices = new Set<number>();
  for (const p of placements) {
    if (p.shipIndex < 0 || p.shipIndex >= CLASSIC_SHIPS.length) return false;
    if (usedIndices.has(p.shipIndex)) return false;
    usedIndices.add(p.shipIndex);
  }

  const occupied = new Set<number>();
  for (const p of placements) {
    const ship = CLASSIC_SHIPS[p.shipIndex];
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

export function placeShipsOnGrid(placements: ShipPlacement[]): number[] | null {
  if (!validateShipPlacements(placements)) return null;

  const grid = new Array(TOTAL_CELLS).fill(0);
  for (const p of placements) {
    const ship = CLASSIC_SHIPS[p.shipIndex];
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

export function checkAllShipsSunk(grid: number[], shots: number[]): boolean {
  for (let v = 1; v <= CLASSIC_SHIPS.length; v++) {
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
}

const ShipPlacementSchema = z.object({
  shipIndex: z.number().int().min(0).max(4),
  row: z.number().int().min(0).max(9),
  col: z.number().int().min(0).max(9),
  rotation: z.number().int().min(0).max(3),
});

export const ActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('place_ships'),
    placements: z.array(ShipPlacementSchema).length(5),
  }),
  z.object({
    type: z.literal('fire'),
    row: z.number().int().min(0).max(9),
    col: z.number().int().min(0).max(9),
  }),
]);

export type Action = z.infer<typeof ActionSchema>;
