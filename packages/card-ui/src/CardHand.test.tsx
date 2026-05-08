import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CardHand, computeFanSlot, computeHandDimensions } from './CardHand.js';
import { PlayingCard } from './PlayingCard.js';

function extractSlotTransforms(html: string): string[] {
  const matches = Array.from(html.matchAll(/class="card-ui-hand-slot"[^>]*style="([^"]+)"/g));
  return matches.map((m) => m[1]);
}

function renderHand(n: number, selectedIndex: number | null = null): string {
  const children = Array.from({ length: n }, (_, i) => (
    <PlayingCard key={i} suit="spades" rank="A" selected={i === selectedIndex} />
  ));
  return renderToStaticMarkup(<CardHand>{children}</CardHand>);
}

describe('computeFanSlot', () => {
  it('returns zero transform for a single child', () => {
    expect(computeFanSlot(0, 1)).toEqual({ rotateDeg: 0, translateX: 0, translateY: 0 });
  });

  it('is symmetric around the center', () => {
    const left = computeFanSlot(0, 5);
    const right = computeFanSlot(4, 5);
    expect(left.rotateDeg).toBe(-right.rotateDeg);
    expect(left.translateX).toBe(-right.translateX);
    expect(left.translateY).toBe(right.translateY);
  });

  it('places the middle child at the origin for odd counts', () => {
    expect(computeFanSlot(2, 5)).toEqual({ rotateDeg: 0, translateX: 0, translateY: 0 });
  });

  it('produces monotonically increasing |x| outward from center', () => {
    const count = 7;
    const center = (count - 1) / 2;
    const xs = Array.from({ length: count }, (_, i) =>
      Math.abs(computeFanSlot(i, count).translateX),
    );
    for (let i = 0; i < count; i++) {
      expect(xs[i]).toBeCloseTo(Math.abs(i - center) * 34);
    }
  });
});

describe('computeHandDimensions', () => {
  it('scales width with child count', () => {
    const one = computeHandDimensions(1);
    const five = computeHandDimensions(5);
    expect(five.width).toBeGreaterThan(one.width);
  });

  it('respects size preset', () => {
    expect(computeHandDimensions(5, 'sm').width).toBeLessThan(computeHandDimensions(5, 'lg').width);
  });
});

describe('CardHand', () => {
  it('renders one slot per child with a data-slot-index attribute', () => {
    const html = renderHand(5);
    expect(html).toContain('data-count="5"');
    for (let i = 0; i < 5; i++) {
      expect(html).toContain(`data-slot-index="${i}"`);
    }
  });

  it('assigns fixed container dimensions so layout does not reflow', () => {
    const html = renderHand(5);
    const dims = computeHandDimensions(5);
    expect(html).toContain(`width:${dims.width}px`);
    expect(html).toContain(`height:${dims.height}px`);
  });

  it('gives each slot a deterministic transform based on its index', () => {
    const html = renderHand(5);
    const transforms = extractSlotTransforms(html);
    expect(transforms).toHaveLength(5);
    for (let i = 0; i < 5; i++) {
      const slot = computeFanSlot(i, 5);
      expect(transforms[i]).toContain(`translate(${slot.translateX}px, ${slot.translateY}px)`);
      expect(transforms[i]).toContain(`rotate(${slot.rotateDeg}deg)`);
    }
  });

  it('does not translate siblings when the middle child is selected', () => {
    // N=5 children; if one card flips to selected, the four siblings' slot
    // positions must be byte-identical to the unselected layout.
    const baseline = extractSlotTransforms(renderHand(5, null));
    const withMiddleSelected = extractSlotTransforms(renderHand(5, 2));
    expect(withMiddleSelected).toHaveLength(5);
    for (let i = 0; i < 5; i++) {
      if (i === 2) continue;
      expect(withMiddleSelected[i]).toBe(baseline[i]);
    }
    // Container dimensions stay pinned too so the hand doesn't reflow.
    const dims = computeHandDimensions(5);
    expect(renderHand(5, 2)).toContain(`width:${dims.width}px;height:${dims.height}px`);
  });

  it('renders empty when given no children without throwing', () => {
    const html = renderToStaticMarkup(<CardHand>{[]}</CardHand>);
    expect(html).toContain('data-count="0"');
  });
});
