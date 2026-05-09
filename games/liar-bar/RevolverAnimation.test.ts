import { describe, expect, it } from 'vitest';
import { FLASH_MS, SPIN_MS_CONDENSED, SPIN_MS_FULL, getAnimationTiming } from './revolverTiming';

describe('RevolverAnimation timing', () => {
  it('full variant spins ~600ms then flashes ~220ms', () => {
    const t = getAnimationTiming(false, false);
    expect(t.spinMs).toBe(SPIN_MS_FULL);
    expect(t.flashMs).toBe(FLASH_MS);
    expect(t.totalMs).toBe(SPIN_MS_FULL + FLASH_MS);
  });

  it('condensed variant uses a shorter spin', () => {
    const t = getAnimationTiming(false, true);
    expect(t.spinMs).toBe(SPIN_MS_CONDENSED);
    expect(t.spinMs).toBeLessThan(SPIN_MS_FULL);
    expect(t.flashMs).toBe(FLASH_MS);
    expect(t.totalMs).toBe(SPIN_MS_CONDENSED + FLASH_MS);
  });

  it('respects prefers-reduced-motion: spin=0, only flash', () => {
    const reduceFull = getAnimationTiming(true, false);
    const reduceCondensed = getAnimationTiming(true, true);
    expect(reduceFull.spinMs).toBe(0);
    expect(reduceCondensed.spinMs).toBe(0);
    expect(reduceFull.totalMs).toBe(FLASH_MS);
    expect(reduceCondensed.totalMs).toBe(FLASH_MS);
  });

  it('reduce overrides condensed flag (no spin in either case)', () => {
    expect(getAnimationTiming(true, false).spinMs).toBe(0);
    expect(getAnimationTiming(true, true).spinMs).toBe(0);
  });
});
