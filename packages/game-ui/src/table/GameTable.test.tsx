import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GameTable } from './GameTable';

describe('GameTable', () => {
  it('defaults to cream surface when surface omitted', () => {
    const { getByTestId } = render(
      <GameTable>
        <span>child</span>
      </GameTable>,
    );
    expect(getByTestId('game-table').getAttribute('data-surface')).toBe('cream');
  });

  it('applies the felt background class when surface="felt"', () => {
    const { getByTestId } = render(
      <GameTable surface="felt">
        <span>child</span>
      </GameTable>,
    );
    const el = getByTestId('game-table');
    expect(el.getAttribute('data-surface')).toBe('felt');
    expect(el.className).toMatch(/bg-felt/);
  });

  it('renders children inside the table container', () => {
    const { getByText } = render(
      <GameTable surface="water">
        <span>hello world</span>
      </GameTable>,
    );
    expect(getByText('hello world')).toBeTruthy();
  });
});
