import { GameTestHarness } from '@repo/shared/testing';
import { describe, expect, it } from 'vitest';
import { logic } from './logic';

describe('Template Logic', () => {
  function createGame() {
    const h = new GameTestHarness(logic, {
      players: ['Alice', 'Bob'],
      seed: 'test-seed',
    });
    h.setup();
    return h;
  }

  it('sets up correctly', () => {
    const h = createGame();
    expect(h.view('Alice').currentPlayer).toBe('Alice');
  });

  it('rejects action out of turn', () => {
    const h = createGame();
    const result = h.action('Bob', { type: 'example_action' });
    expect(result.ok).toBe(false);
  });
});
