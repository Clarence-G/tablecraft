import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { JokerCard } from './JokerCard.js';
import type { CardSize } from './index.js';

const SIZES: CardSize[] = ['sm', 'md', 'lg'];

describe('JokerCard', () => {
  it('renders in every size without error', () => {
    for (const size of SIZES) {
      const html = renderToStaticMarkup(<JokerCard size={size} />);
      expect(html).toContain('card-ui-card');
      expect(html).toContain('data-rank="JOKER"');
    }
  });

  it('defaults to size md', () => {
    const html = renderToStaticMarkup(<JokerCard />);
    expect(html).toContain('width:72px');
    expect(html).toContain('height:100px');
  });

  it('applies selected class when selected is true', () => {
    const html = renderToStaticMarkup(<JokerCard selected />);
    expect(html).toContain('card-ui-selected');
  });

  it('does not apply selected class by default', () => {
    const html = renderToStaticMarkup(<JokerCard />);
    expect(html).not.toContain('card-ui-selected');
  });

  it('labels itself as joker for accessibility', () => {
    const html = renderToStaticMarkup(<JokerCard />);
    expect(html).toContain('aria-label="joker"');
  });

  it('renders JOKER text in both corners', () => {
    const html = renderToStaticMarkup(<JokerCard />);
    expect(html).toContain('card-ui-corner-tl');
    expect(html).toContain('card-ui-corner-br');
    const jokerMatches = html.match(/>JOKER</g) ?? [];
    expect(jokerMatches.length).toBeGreaterThanOrEqual(2);
  });

  it('matches snapshot for canonical md joker', () => {
    const html = renderToStaticMarkup(<JokerCard size="md" />);
    expect(html).toMatchSnapshot();
  });
});
