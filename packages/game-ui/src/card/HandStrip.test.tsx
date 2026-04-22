import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HandStrip } from './HandStrip';

interface Card {
  id: string;
  v: number;
}

const CARDS: Card[] = Array.from({ length: 3 }, (_, i) => ({ id: `c${i}`, v: i }));
const LONG_HAND: Card[] = Array.from({ length: 12 }, (_, i) => ({ id: `c${i}`, v: i }));

describe('HandStrip', () => {
  it('renders each card through renderCard', () => {
    const { getAllByTestId } = render(
      <HandStrip
        cards={CARDS}
        getKey={(c) => c.id}
        renderCard={(c) => (
          <button type="button" data-testid="card" key={c.id}>
            {c.v}
          </button>
        )}
      />,
    );
    expect(getAllByTestId('card')).toHaveLength(3);
  });

  it('passes selected=true only to the selected key', () => {
    const seen: Record<string, boolean> = {};
    render(
      <HandStrip
        cards={CARDS}
        getKey={(c) => c.id}
        selectedKey="c1"
        renderCard={(c, { selected }) => {
          seen[c.id] = selected;
          return <span key={c.id}>{c.v}</span>;
        }}
      />,
    );
    expect(seen).toEqual({ c0: false, c1: true, c2: false });
  });

  it('passes disabled flag from isDisabled callback', () => {
    const seen: Record<string, boolean> = {};
    render(
      <HandStrip
        cards={CARDS}
        getKey={(c) => c.id}
        isDisabled={(c) => c.v === 1}
        renderCard={(c, { disabled }) => {
          seen[c.id] = disabled;
          return <span key={c.id}>{c.v}</span>;
        }}
      />,
    );
    expect(seen).toEqual({ c0: false, c1: true, c2: false });
  });

  it('invokes onSelect with the card key and value', () => {
    const onSelect = vi.fn();
    const { getAllByRole } = render(
      <HandStrip
        cards={CARDS}
        getKey={(c) => c.id}
        onSelect={onSelect}
        renderCard={(c, { onSelect: sel }) => (
          <button type="button" key={c.id} onClick={sel}>
            {c.v}
          </button>
        )}
      />,
    );
    fireEvent.click(getAllByRole('button')[1]);
    expect(onSelect).toHaveBeenCalledWith('c1', CARDS[1]);
  });

  it('applies negative margin on overflow (overlap mode)', () => {
    const { container } = render(
      <HandStrip
        cards={LONG_HAND}
        getKey={(c) => c.id}
        overlapThreshold={9}
        maxOverlap={20}
        renderCard={(c) => <span key={c.id}>{c.v}</span>}
      />,
    );
    const wrappers = container.querySelectorAll('[data-testid="hand-strip"] > div');
    expect(wrappers.length).toBe(12);
    expect((wrappers[0] as HTMLElement).style.marginLeft).toBe('');
    expect((wrappers[1] as HTMLElement).style.marginLeft).toContain('20px');
  });

  it('renders empty state with emptyLabel when no cards', () => {
    const { getByTestId, getByText } = render(
      <HandStrip
        cards={[]}
        getKey={(c: Card) => c.id}
        emptyLabel="nothing here"
        renderCard={(c) => <span key={c.id}>{c.v}</span>}
      />,
    );
    expect(getByTestId('hand-strip').getAttribute('data-empty')).toBe('true');
    expect(getByText('nothing here')).toBeInTheDocument();
  });
});
