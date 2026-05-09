import { describe, expect, it } from 'vitest';
import { SHIP_SHAPES, type Shape, type ShapeCell, mirror, normalize, rotate } from './shapes';

type Orientation = { degrees: 0 | 90 | 180 | 270; mirrored: boolean };

const ORIENTATIONS: Orientation[] = [
  { degrees: 0, mirrored: false },
  { degrees: 90, mirrored: false },
  { degrees: 180, mirrored: false },
  { degrees: 270, mirrored: false },
  { degrees: 0, mirrored: true },
  { degrees: 90, mirrored: true },
  { degrees: 180, mirrored: true },
  { degrees: 270, mirrored: true },
];

function orient(shape: Shape, o: Orientation): Shape {
  const r = rotate(shape, o.degrees);
  return o.mirrored ? mirror(r) : r;
}

function sortCells(cells: ShapeCell[]): ShapeCell[] {
  return [...cells].sort((a, b) => (a[0] !== b[0] ? a[0] - b[0] : a[1] - b[1]));
}

function cellSet(cells: ShapeCell[]): Set<string> {
  return new Set(cells.map(([x, y]) => `${x},${y}`));
}

describe('SHIP_SHAPES library', () => {
  it('exports at least 5 distinct shapes with the required ids', () => {
    const ids = new Set(SHIP_SHAPES.map((s) => s.id));
    expect(SHIP_SHAPES.length).toBeGreaterThanOrEqual(5);
    for (const required of ['U', 'Z', 'L', 'T', 'plus', 'S']) {
      expect(ids.has(required)).toBe(true);
    }
  });

  it('every canonical shape is already normalized', () => {
    for (const s of SHIP_SHAPES) {
      const minX = Math.min(...s.cells.map((c) => c[0]));
      const minY = Math.min(...s.cells.map((c) => c[1]));
      expect(minX).toBe(0);
      expect(minY).toBe(0);
    }
  });

  it('every canonical shape has unique cells', () => {
    for (const s of SHIP_SHAPES) {
      expect(cellSet(s.cells).size).toBe(s.cells.length);
    }
  });
});

describe('normalize', () => {
  it('offsets coordinates so min(dx)=0 and min(dy)=0', () => {
    const n = normalize({
      id: 'x',
      cells: [
        [2, 3],
        [4, 3],
        [2, 5],
      ],
    });
    expect(sortCells(n.cells)).toEqual([
      [0, 0],
      [0, 2],
      [2, 0],
    ]);
  });

  it('is idempotent', () => {
    for (const s of SHIP_SHAPES) {
      const a = normalize(s);
      const b = normalize(a);
      expect(sortCells(a.cells)).toEqual(sortCells(b.cells));
    }
  });

  it('handles negative coordinates', () => {
    const n = normalize({
      id: 'x',
      cells: [
        [-1, -2],
        [0, 0],
      ],
    });
    expect(sortCells(n.cells)).toEqual([
      [0, 0],
      [1, 2],
    ]);
  });
});

describe('rotate', () => {
  it('rotate by 0 returns a normalized copy equal to the canonical shape', () => {
    for (const s of SHIP_SHAPES) {
      const r = rotate(s, 0);
      expect(sortCells(r.cells)).toEqual(sortCells(s.cells));
    }
  });

  it('rotate by 360° (four 90° rotations) is the identity', () => {
    for (const s of SHIP_SHAPES) {
      let cur = s;
      for (let i = 0; i < 4; i++) cur = rotate(cur, 90);
      expect(sortCells(cur.cells)).toEqual(sortCells(s.cells));
    }
  });

  it('rotate by 180° equals two 90° rotations', () => {
    for (const s of SHIP_SHAPES) {
      const a = rotate(s, 180);
      const b = rotate(rotate(s, 90), 90);
      expect(sortCells(a.cells)).toEqual(sortCells(b.cells));
    }
  });

  it('L shape 90° produces expected horizontal corner', () => {
    const l = SHIP_SHAPES.find((s) => s.id === 'L');
    if (!l) throw new Error('missing L');
    const r90 = rotate(l, 90);
    expect(sortCells(r90.cells)).toEqual([
      [0, 0],
      [0, 1],
      [0, 2],
      [1, 0],
    ]);
  });

  it('L shape 180° produces expected flipped L', () => {
    const l = SHIP_SHAPES.find((s) => s.id === 'L');
    if (!l) throw new Error('missing L');
    const r180 = rotate(l, 180);
    expect(sortCells(r180.cells)).toEqual([
      [0, 0],
      [0, 1],
      [1, 1],
      [2, 1],
    ]);
  });

  it('L shape 270° produces expected expected horizontal corner', () => {
    const l = SHIP_SHAPES.find((s) => s.id === 'L');
    if (!l) throw new Error('missing L');
    const r270 = rotate(l, 270);
    expect(sortCells(r270.cells)).toEqual([
      [0, 2],
      [1, 0],
      [1, 1],
      [1, 2],
    ]);
  });

  it('T shape 90° produces expected T rotated right', () => {
    const t = SHIP_SHAPES.find((s) => s.id === 'T');
    if (!t) throw new Error('missing T');
    const r90 = rotate(t, 90);
    expect(sortCells(r90.cells)).toEqual([
      [0, 1],
      [1, 0],
      [1, 1],
      [2, 1],
    ]);
  });

  it('plus shape is invariant under all four rotations', () => {
    const plus = SHIP_SHAPES.find((s) => s.id === 'plus');
    if (!plus) throw new Error('missing plus');
    const base = sortCells(plus.cells);
    for (const d of [0, 90, 180, 270] as const) {
      const r = rotate(plus, d);
      expect(sortCells(r.cells)).toEqual(base);
    }
  });
});

describe('mirror', () => {
  it('mirror is an involution (applying twice returns the original)', () => {
    for (const s of SHIP_SHAPES) {
      const twice = mirror(mirror(s));
      expect(sortCells(twice.cells)).toEqual(sortCells(s.cells));
    }
  });

  it('S mirrored equals Z', () => {
    const s = SHIP_SHAPES.find((x) => x.id === 'S');
    const z = SHIP_SHAPES.find((x) => x.id === 'Z');
    if (!s || !z) throw new Error('missing S or Z');
    expect(sortCells(mirror(s).cells)).toEqual(sortCells(z.cells));
  });

  it('plus-cross is invariant under mirror', () => {
    const plus = SHIP_SHAPES.find((x) => x.id === 'plus');
    if (!plus) throw new Error('missing plus');
    expect(sortCells(mirror(plus).cells)).toEqual(sortCells(plus.cells));
  });
});

describe('orientation matrix: each shape x 4 rotations x 2 mirrors', () => {
  for (const shape of SHIP_SHAPES) {
    for (const o of ORIENTATIONS) {
      it(`${shape.id} @ ${o.degrees}° mirror=${o.mirrored} is normalized with preserved cell count and no duplicates`, () => {
        const out = orient(shape, o);
        // Normalized: min dx = min dy = 0
        const minX = Math.min(...out.cells.map((c) => c[0]));
        const minY = Math.min(...out.cells.map((c) => c[1]));
        expect(minX).toBe(0);
        expect(minY).toBe(0);
        // Cell count preserved
        expect(out.cells.length).toBe(shape.cells.length);
        // Unique cells
        expect(cellSet(out.cells).size).toBe(shape.cells.length);
        // Id preserved
        expect(out.id).toBe(shape.id);
      });
    }
  }
});

describe('L shape: explicit expected coordinates for every orientation', () => {
  const l = SHIP_SHAPES.find((s) => s.id === 'L');
  if (!l) throw new Error('missing L');

  const expected: Record<string, ShapeCell[]> = {
    '0,false': [
      [0, 0],
      [1, 0],
      [2, 0],
      [2, 1],
    ],
    '90,false': [
      [0, 0],
      [0, 1],
      [0, 2],
      [1, 0],
    ],
    '180,false': [
      [0, 0],
      [0, 1],
      [1, 1],
      [2, 1],
    ],
    '270,false': [
      [0, 2],
      [1, 0],
      [1, 1],
      [1, 2],
    ],
    '0,true': [
      [0, 1],
      [1, 1],
      [2, 0],
      [2, 1],
    ],
    '90,true': [
      [0, 0],
      [0, 1],
      [0, 2],
      [1, 2],
    ],
    '180,true': [
      [0, 0],
      [0, 1],
      [1, 0],
      [2, 0],
    ],
    '270,true': [
      [0, 0],
      [1, 0],
      [1, 1],
      [1, 2],
    ],
  };

  for (const o of ORIENTATIONS) {
    it(`L @ ${o.degrees}° mirror=${o.mirrored} matches expected coordinates`, () => {
      const out = orient(l, o);
      const key = `${o.degrees},${o.mirrored}`;
      expect(sortCells(out.cells)).toEqual(expected[key]);
    });
  }
});
