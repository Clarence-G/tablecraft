import type { GameMeta } from '@repo/shared';
import { z } from 'zod';

export const meta: GameMeta = {
  id: 'hive',
  name: 'Hive',
  description: '昆虫棋，用各种昆虫包围对手的蜂后',
  minPlayers: 2,
  maxPlayers: 2,
  tags: ['策略', '棋类'],
  icon: 'bee',
  estimatedMinutes: 30,
  surface: 'wood',
  rules:
    '两人轮流在六角棋盘上放置或移动昆虫棋子，用棋子完全包围对手的蜂后即获胜。蜂后必须在第 4 回合前放置。',
  agentRules: `Hex grid using axial coordinates {q, r}. White plays first. Each player has: 1 Queen, 2 Spiders, 2 Beetles, 3 Grasshoppers, 3 Ants.

Key rule: Queen must be placed by turn 4. Pieces must stay connected (one hive). Use validActions from PlayerView to determine legal moves.

Actions:
  { "type": "place", "pieceType": "queen"|"spider"|"beetle"|"grasshopper"|"ant", "coord": { "q": <int>, "r": <int> } }
  { "type": "move", "from": { "q": <int>, "r": <int> }, "to": { "q": <int>, "r": <int> } }
  { "type": "pass" }  — only when no legal place or move exists

Piece movement:
  Queen: 1 step. Spider: exactly 3 steps along hive edge. Beetle: 1 step, can climb on top of other pieces.
  Grasshopper: jump in straight line over adjacent pieces. Ant: any number of steps along hive edge.

PlayerView fields:
  tiles: { coord: {q,r}, color: "white"|"black", type: string, stackLevel: number }[]
  myColor: "white"|"black"
  currentPlayer: string
  phase: "playing"|"finished"
  turnNumber: number
  validActions: { placements: [{pieceType, targets: {q,r}[]}], moves: [{from: {q,r}, targets: {q,r}[]}] } | null
  whiteInventory: { queen, spider, beetle, grasshopper, ant } — remaining piece counts
  blackInventory: same
  winner: string|null
  isDraw: boolean

Win condition: opponent's Queen is completely surrounded (all 6 adjacent hexes occupied).`,
};

// ============ Types ============

export type HiveColor = 'white' | 'black';
export type HivePieceType = 'queen' | 'spider' | 'beetle' | 'grasshopper' | 'ant';

export interface HexCoord {
  q: number;
  r: number;
}

export interface Tile {
  coord: HexCoord;
  color: HiveColor;
  type: HivePieceType;
  stackLevel: number;
}

export interface PieceInventory {
  queen: number;
  spider: number;
  beetle: number;
  grasshopper: number;
  ant: number;
}

export interface ValidActions {
  placements: { pieceType: HivePieceType; targets: HexCoord[] }[];
  moves: { from: HexCoord; targets: HexCoord[] }[];
}

export type WinResult = { type: 'none' } | { type: 'white' } | { type: 'black' } | { type: 'draw' };

// ============ Constants ============

export const INITIAL_INVENTORY: PieceInventory = {
  queen: 1,
  spider: 2,
  beetle: 2,
  grasshopper: 3,
  ant: 3,
};

export const PIECE_TYPES: HivePieceType[] = ['queen', 'spider', 'beetle', 'grasshopper', 'ant'];

export const DIRECTIONS: HexCoord[] = [
  { q: 1, r: 0 },
  { q: -1, r: 0 },
  { q: 0, r: 1 },
  { q: 0, r: -1 },
  { q: 1, r: -1 },
  { q: -1, r: 1 },
];

// ============ Hex Utilities ============

export function coordKey(c: HexCoord): string {
  return `${c.q},${c.r}`;
}

export function parseCoordKey(key: string): HexCoord {
  const parts = key.split(',');
  return { q: Number(parts[0]), r: Number(parts[1]) };
}

export function getNeighbors(c: HexCoord): HexCoord[] {
  return DIRECTIONS.map((d) => ({ q: c.q + d.q, r: c.r + d.r }));
}

export function coordEqual(a: HexCoord, b: HexCoord): boolean {
  return a.q === b.q && a.r === b.r;
}

// ============ Tile Queries ============

export function buildTileMap(tiles: Tile[]): Map<string, Tile[]> {
  const map = new Map<string, Tile[]>();
  for (const tile of tiles) {
    const key = coordKey(tile.coord);
    const stack = map.get(key) ?? [];
    stack.push(tile);
    stack.sort((a, b) => a.stackLevel - b.stackLevel);
    map.set(key, stack);
  }
  return map;
}

export function getTopTileAt(tileMap: Map<string, Tile[]>, coord: HexCoord): Tile | null {
  const stack = tileMap.get(coordKey(coord));
  if (!stack || stack.length === 0) return null;
  return stack[stack.length - 1];
}

export function getOccupiedCoords(tileMap: Map<string, Tile[]>): Set<string> {
  return new Set(tileMap.keys());
}

export function getGroundTiles(tiles: Tile[]): Tile[] {
  const tileMap = buildTileMap(tiles);
  const result: Tile[] = [];
  for (const stack of tileMap.values()) {
    result.push(stack[stack.length - 1]);
  }
  return result;
}

// ============ One-Hive Rule ============

export function isHiveConnectedWithout(tiles: Tile[], excludeTile: Tile): boolean {
  const remaining = tiles.filter(
    (t) => !(coordEqual(t.coord, excludeTile.coord) && t.stackLevel === excludeTile.stackLevel),
  );

  if (remaining.length === 0) return true;

  const tileMap = buildTileMap(remaining);
  const occupiedKeys = new Set(tileMap.keys());

  if (occupiedKeys.size === 0) return true;

  const startIter = occupiedKeys.values().next();
  if (startIter.done) return true;
  const start = startIter.value;
  const visited = new Set<string>();
  const queue = [start];
  visited.add(start);

  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) break;
    const coord = parseCoordKey(current);
    for (const neighbor of getNeighbors(coord)) {
      const nKey = coordKey(neighbor);
      if (occupiedKeys.has(nKey) && !visited.has(nKey)) {
        visited.add(nKey);
        queue.push(nKey);
      }
    }
  }

  return visited.size === occupiedKeys.size;
}

// ============ Sliding Rule ============

export function canSlide(
  tileMap: Map<string, Tile[]>,
  from: HexCoord,
  to: HexCoord,
  excludeCoord?: string,
): boolean {
  const fromNeighbors = getNeighbors(from);
  const toNeighbors = getNeighbors(to);

  const gates: HexCoord[] = [];
  for (const fn of fromNeighbors) {
    for (const tn of toNeighbors) {
      if (coordEqual(fn, tn)) {
        gates.push(fn);
      }
    }
  }

  const gatesOccupied = gates.filter((g) => {
    const key = coordKey(g);
    if (key === excludeCoord) return false;
    return tileMap.has(key);
  });

  if (gatesOccupied.length >= 2) return false;

  return true;
}

// ============ Placement Rules ============

export function getValidPlacements(
  tiles: Tile[],
  color: HiveColor,
  turnNumber: number,
): HexCoord[] {
  if (tiles.length === 0) {
    return [{ q: 0, r: 0 }];
  }

  if (tiles.length === 1) {
    return getNeighbors(tiles[0].coord);
  }

  const tileMap = buildTileMap(tiles);
  const occupied = getOccupiedCoords(tileMap);

  const candidates = new Set<string>();
  for (const key of occupied) {
    const coord = parseCoordKey(key);
    for (const neighbor of getNeighbors(coord)) {
      const nKey = coordKey(neighbor);
      if (!occupied.has(nKey)) {
        candidates.add(nKey);
      }
    }
  }

  const valid: HexCoord[] = [];
  for (const candKey of candidates) {
    const cand = parseCoordKey(candKey);
    const neighbors = getNeighbors(cand);
    let touchesOwn = false;
    let touchesOpponent = false;

    for (const n of neighbors) {
      const topTile = getTopTileAt(tileMap, n);
      if (topTile) {
        if (topTile.color === color) {
          touchesOwn = true;
        } else {
          touchesOpponent = true;
        }
      }
    }

    if (touchesOwn && !touchesOpponent) {
      valid.push(cand);
    }
  }

  return valid;
}

export function mustPlaceQueen(inventory: PieceInventory, playerTurnCount: number): boolean {
  return playerTurnCount === 3 && inventory.queen > 0;
}

export function hasQueenOnBoard(tiles: Tile[], color: HiveColor): boolean {
  return tiles.some((t) => t.color === color && t.type === 'queen');
}

// ============ Movement Rules ============

function isAdjacentToOccupied(coord: HexCoord, occupied: Set<string>): boolean {
  return getNeighbors(coord).some((n) => occupied.has(coordKey(n)));
}

function getQueenMoves(tiles: Tile[], tile: Tile): HexCoord[] {
  const tilesWithout = tiles.filter(
    (t) => !(coordEqual(t.coord, tile.coord) && t.stackLevel === tile.stackLevel),
  );
  const tileMap = buildTileMap(tilesWithout);
  const occupied = getOccupiedCoords(tileMap);
  const neighbors = getNeighbors(tile.coord);
  const excludeKey = coordKey(tile.coord);

  const valid: HexCoord[] = [];
  for (const n of neighbors) {
    const nKey = coordKey(n);
    if (occupied.has(nKey)) continue;
    if (!isAdjacentToOccupied(n, occupied)) continue;
    if (!canSlide(tileMap, tile.coord, n, excludeKey)) continue;
    valid.push(n);
  }
  return valid;
}

function getSpiderMoves(tiles: Tile[], tile: Tile): HexCoord[] {
  const tilesWithout = tiles.filter(
    (t) => !(coordEqual(t.coord, tile.coord) && t.stackLevel === tile.stackLevel),
  );
  const tileMap = buildTileMap(tilesWithout);
  const occupied = getOccupiedCoords(tileMap);
  const excludeKey = coordKey(tile.coord);

  const results = new Set<string>();

  function dfs(current: HexCoord, path: string[], depth: number) {
    if (depth === 3) {
      results.add(coordKey(current));
      return;
    }
    for (const n of getNeighbors(current)) {
      const nKey = coordKey(n);
      if (path.includes(nKey)) continue;
      if (occupied.has(nKey)) continue;
      if (!isAdjacentToOccupied(n, occupied)) continue;
      if (!canSlide(tileMap, current, n, excludeKey)) continue;
      dfs(n, [...path, nKey], depth + 1);
    }
  }

  dfs(tile.coord, [coordKey(tile.coord)], 0);
  results.delete(coordKey(tile.coord));
  return [...results].map(parseCoordKey);
}

function getBeetleMoves(tiles: Tile[], tile: Tile): HexCoord[] {
  const tilesWithout = tiles.filter(
    (t) => !(coordEqual(t.coord, tile.coord) && t.stackLevel === tile.stackLevel),
  );
  const tileMap = buildTileMap(tilesWithout);
  const occupied = getOccupiedCoords(tileMap);
  const neighbors = getNeighbors(tile.coord);

  const valid: HexCoord[] = [];
  for (const n of neighbors) {
    const nKey = coordKey(n);
    const targetStack = tileMap.get(nKey);
    const isTargetOccupied = !!targetStack && targetStack.length > 0;

    if (tile.stackLevel > 0) {
      if (!isTargetOccupied && !isAdjacentToOccupied(n, occupied)) continue;
      valid.push(n);
    } else {
      if (isTargetOccupied) {
        valid.push(n);
      } else {
        if (!isAdjacentToOccupied(n, occupied)) continue;
        if (!canSlide(tileMap, tile.coord, n, coordKey(tile.coord))) continue;
        valid.push(n);
      }
    }
  }
  return valid;
}

function getGrasshopperMoves(tiles: Tile[], tile: Tile): HexCoord[] {
  const tilesWithout = tiles.filter(
    (t) => !(coordEqual(t.coord, tile.coord) && t.stackLevel === tile.stackLevel),
  );
  const tileMap = buildTileMap(tilesWithout);
  const occupied = getOccupiedCoords(tileMap);

  const valid: HexCoord[] = [];
  for (const dir of DIRECTIONS) {
    let current = { q: tile.coord.q + dir.q, r: tile.coord.r + dir.r };
    let jumpedOver = 0;
    while (occupied.has(coordKey(current))) {
      jumpedOver++;
      current = { q: current.q + dir.q, r: current.r + dir.r };
    }
    if (jumpedOver > 0) {
      valid.push(current);
    }
  }
  return valid;
}

function getAntMoves(tiles: Tile[], tile: Tile): HexCoord[] {
  const tilesWithout = tiles.filter(
    (t) => !(coordEqual(t.coord, tile.coord) && t.stackLevel === tile.stackLevel),
  );
  const tileMap = buildTileMap(tilesWithout);
  const occupied = getOccupiedCoords(tileMap);
  const excludeKey = coordKey(tile.coord);

  const visited = new Set<string>();
  const queue: HexCoord[] = [tile.coord];
  visited.add(coordKey(tile.coord));
  const results: HexCoord[] = [];

  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) break;
    for (const n of getNeighbors(current)) {
      const nKey = coordKey(n);
      if (visited.has(nKey)) continue;
      if (occupied.has(nKey)) continue;
      if (!isAdjacentToOccupied(n, occupied)) continue;
      if (!canSlide(tileMap, current, n, excludeKey)) continue;
      visited.add(nKey);
      queue.push(n);
      results.push(n);
    }
  }
  return results;
}

export function getValidMoves(tiles: Tile[], tile: Tile): HexCoord[] {
  if (!hasQueenOnBoard(tiles, tile.color)) return [];

  const tileMap = buildTileMap(tiles);
  const stack = tileMap.get(coordKey(tile.coord));
  const isOnTop = stack !== undefined && stack[stack.length - 1].stackLevel === tile.stackLevel;

  if (!isOnTop) return [];

  if (tile.stackLevel === 0) {
    if (!isHiveConnectedWithout(tiles, tile)) return [];
  }

  switch (tile.type) {
    case 'queen':
      return getQueenMoves(tiles, tile);
    case 'spider':
      return getSpiderMoves(tiles, tile);
    case 'beetle':
      return getBeetleMoves(tiles, tile);
    case 'grasshopper':
      return getGrasshopperMoves(tiles, tile);
    case 'ant':
      return getAntMoves(tiles, tile);
  }
}

// ============ Composite: All Valid Actions ============

export function getAllValidActions(
  tiles: Tile[],
  color: HiveColor,
  playerTurnCount: number,
  inventory: PieceInventory,
): ValidActions {
  const placements: ValidActions['placements'] = [];
  const moves: ValidActions['moves'] = [];

  const placementTargets = getValidPlacements(tiles, color, playerTurnCount);
  if (placementTargets.length > 0) {
    const forceQueen = mustPlaceQueen(inventory, playerTurnCount);
    if (forceQueen) {
      placements.push({ pieceType: 'queen', targets: placementTargets });
    } else {
      for (const pt of PIECE_TYPES) {
        if (inventory[pt] > 0) {
          placements.push({ pieceType: pt, targets: placementTargets });
        }
      }
    }
  }

  if (hasQueenOnBoard(tiles, color)) {
    const tileMap = buildTileMap(tiles);
    for (const [, stack] of tileMap) {
      const topTile = stack[stack.length - 1];
      if (topTile.color !== color) continue;
      const targets = getValidMoves(tiles, topTile);
      if (targets.length > 0) {
        moves.push({ from: topTile.coord, targets });
      }
    }
  }

  return { placements, moves };
}

export function hasAnyValidAction(actions: ValidActions): boolean {
  return actions.placements.length > 0 || actions.moves.length > 0;
}

// ============ Win Check ============

export function checkWin(tiles: Tile[]): WinResult {
  const tileMap = buildTileMap(tiles);
  let whiteQueenSurrounded = false;
  let blackQueenSurrounded = false;

  for (const tile of tiles) {
    if (tile.type !== 'queen' || tile.stackLevel !== 0) continue;
    const neighbors = getNeighbors(tile.coord);
    const allSurrounded = neighbors.every((n) => tileMap.has(coordKey(n)));
    if (allSurrounded) {
      if (tile.color === 'white') whiteQueenSurrounded = true;
      if (tile.color === 'black') blackQueenSurrounded = true;
    }
  }

  if (whiteQueenSurrounded && blackQueenSurrounded) return { type: 'draw' };
  if (whiteQueenSurrounded) return { type: 'black' };
  if (blackQueenSurrounded) return { type: 'white' };
  return { type: 'none' };
}

// ============ Inventory Helpers ============

export function createInitialInventory(): PieceInventory {
  return { ...INITIAL_INVENTORY };
}

export function computeInventory(tiles: Tile[], color: HiveColor): PieceInventory {
  const inv = createInitialInventory();
  for (const tile of tiles) {
    if (tile.color === color) {
      inv[tile.type]--;
    }
  }
  return inv;
}

export function getPlayerTurnCount(turnNumber: number, isFirstPlayer: boolean): number {
  if (isFirstPlayer) {
    return Math.floor((turnNumber - 1) / 2);
  }
  return Math.floor((turnNumber - 2) / 2);
}

// ============ Pixel Conversion ============

export const HEX_SIZE = 40;

export function hexToPixel(coord: HexCoord): { x: number; y: number } {
  const x = HEX_SIZE * (3 / 2) * coord.q;
  const y = HEX_SIZE * ((Math.sqrt(3) / 2) * coord.q + Math.sqrt(3) * coord.r);
  return { x, y };
}

// ============ Action Schema ============

export const ActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('place'),
    pieceType: z.enum(['queen', 'spider', 'beetle', 'grasshopper', 'ant']),
    coord: z.object({ q: z.number().int(), r: z.number().int() }),
  }),
  z.object({
    type: z.literal('move'),
    from: z.object({ q: z.number().int(), r: z.number().int() }),
    to: z.object({ q: z.number().int(), r: z.number().int() }),
  }),
  z.object({
    type: z.literal('pass'),
  }),
]);

export type Action = z.infer<typeof ActionSchema>;

// ============ PlayerView ============

export interface PlayerView {
  tiles: Tile[];
  myColor: HiveColor;
  currentPlayer: string;
  phase: 'playing' | 'finished';
  validActions: ValidActions | null;
  whiteInventory: PieceInventory;
  blackInventory: PieceInventory;
  winner: string | null;
  isDraw: boolean;
  turnNumber: number;
}
