import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GameTable } from './GameTable';

describe('GameTable', () => {
  it('renders children inside a flex-1 play-area wrapper', () => {
    const { getByTestId, getByText } = render(
      <GameTable>
        <div>hello</div>
      </GameTable>,
    );
    const el = getByTestId('game-table');
    expect(el.className).toMatch(/flex-1/);
    expect(el.className).toMatch(/min-h-0/);
    expect(getByText('hello')).toBeTruthy();
  });

  it('merges caller className', () => {
    const { getByTestId } = render(
      <GameTable className="custom-x">
        <div />
      </GameTable>,
    );
    expect(getByTestId('game-table').className).toMatch(/custom-x/);
  });
});
