import { describe, expect, it } from 'vitest';
import type { CardRank, CardSize, CardSuit } from './index.js';

describe('@repo/card-ui smoke', () => {
  it('exports playing card type primitives', () => {
    const suit: CardSuit = 'hearts';
    const rank: CardRank = 'A';
    const size: CardSize = 'md';
    expect(suit).toBe('hearts');
    expect(rank).toBe('A');
    expect(size).toBe('md');
  });
});
