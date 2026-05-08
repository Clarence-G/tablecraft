import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CardBack } from './CardBack.js';
import type { CardSize } from './index.js';

const SIZES: CardSize[] = ['sm', 'md', 'lg'];

describe('CardBack', () => {
  it('renders in every size without error', () => {
    for (const size of SIZES) {
      const html = renderToStaticMarkup(<CardBack size={size} />);
      expect(html).toContain('card-ui-card');
      expect(html).toContain('card-ui-face-down');
    }
  });

  it('defaults to size md', () => {
    const html = renderToStaticMarkup(<CardBack />);
    expect(html).toContain('width:72px');
    expect(html).toContain('height:100px');
  });

  it('marks the element as face-down for accessibility', () => {
    const html = renderToStaticMarkup(<CardBack />);
    expect(html).toContain('aria-label="card back"');
    expect(html).toContain('data-face-down="true"');
  });

  it('renders the diamond-grid SVG pattern', () => {
    const html = renderToStaticMarkup(<CardBack />);
    expect(html).toContain('card-ui-back-grid');
    expect(html).toContain('pattern');
  });

  it('matches snapshot for canonical md back', () => {
    const html = renderToStaticMarkup(<CardBack size="md" />);
    expect(html).toMatchSnapshot();
  });
});
