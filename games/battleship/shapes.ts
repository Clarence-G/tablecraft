export type ShapeCell = [number, number];

export interface Shape {
  id: string;
  cells: ShapeCell[];
}

/**
 * Library of irregular (non-straight) ship shapes used by the
 * `irregularShips` option. Coordinates are [dx, dy] with dx=row and dy=col.
 *
 * Each entry is stored in a canonical, already-normalized orientation
 * (min(dx)=0, min(dy)=0). Use {@link rotate}, {@link mirror}, and
 * {@link normalize} to derive any of the 8 possible orientations.
 */
export const SHIP_SHAPES: readonly Shape[] = [
  // U: 5 cells, bucket shape
  //   X . X
  //   X X X
  {
    id: 'U',
    cells: [
      [0, 0],
      [0, 2],
      [1, 0],
      [1, 1],
      [1, 2],
    ],
  },
  // Z: 4 cells (tetromino)
  //   X X .
  //   . X X
  {
    id: 'Z',
    cells: [
      [0, 0],
      [0, 1],
      [1, 1],
      [1, 2],
    ],
  },
  // L: 4 cells (tetromino)
  //   X .
  //   X .
  //   X X
  {
    id: 'L',
    cells: [
      [0, 0],
      [1, 0],
      [2, 0],
      [2, 1],
    ],
  },
  // T: 4 cells (tetromino)
  //   X X X
  //   . X .
  {
    id: 'T',
    cells: [
      [0, 0],
      [0, 1],
      [0, 2],
      [1, 1],
    ],
  },
  // plus-cross: 5 cells
  //   . X .
  //   X X X
  //   . X .
  {
    id: 'plus',
    cells: [
      [0, 1],
      [1, 0],
      [1, 1],
      [1, 2],
      [2, 1],
    ],
  },
  // S: 4 cells (tetromino, mirror of Z but kept as its own entry
  // so the library exposes both chiralities as distinct ids)
  //   . X X
  //   X X .
  {
    id: 'S',
    cells: [
      [0, 1],
      [0, 2],
      [1, 0],
      [1, 1],
    ],
  },
];

export function normalize(shape: Shape): Shape {
  if (shape.cells.length === 0) return { id: shape.id, cells: [] };
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  for (const [x, y] of shape.cells) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
  }
  return {
    id: shape.id,
    cells: shape.cells.map(([x, y]) => [x - minX, y - minY] as ShapeCell),
  };
}

export function rotate(shape: Shape, degrees: 0 | 90 | 180 | 270): Shape {
  const steps = ((Math.round(degrees / 90) % 4) + 4) % 4;
  let cells: ShapeCell[] = shape.cells.map(([x, y]) => [x, y] as ShapeCell);
  for (let i = 0; i < steps; i++) {
    // 90° clockwise: (x, y) -> (y, -x)
    cells = cells.map(([x, y]) => [y, -x] as ShapeCell);
  }
  return normalize({ id: shape.id, cells });
}

export function mirror(shape: Shape): Shape {
  // Flip along the vertical axis: (x, y) -> (x, -y)
  return normalize({
    id: shape.id,
    cells: shape.cells.map(([x, y]) => [x, -y] as ShapeCell),
  });
}

export function getShape(id: string): Shape | undefined {
  return SHIP_SHAPES.find((s) => s.id === id);
}
