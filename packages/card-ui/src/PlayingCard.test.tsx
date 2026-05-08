import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PlayingCard } from './PlayingCard.js';
import type { CardRank, CardSize, CardSuit } from './index.js';

const SUITS: CardSuit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
const RANKS: CardRank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SIZES: CardSize[] = ['sm', 'md', 'lg'];

describe('PlayingCard', () => {
  it('renders every rank and suit combination without error', () => {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        const html = renderToStaticMarkup(<PlayingCard suit={suit} rank={rank} />);
        expect(html).toContain('card-ui-card');
        expect(html).toContain(`data-suit="${suit}"`);
        expect(html).toContain(`data-rank="${rank}"`);
      }
    }
  });

  it('renders in every size without error', () => {
    for (const size of SIZES) {
      const html = renderToStaticMarkup(<PlayingCard suit="spades" rank="A" size={size} />);
      expect(html).toContain('card-ui-card');
    }
  });

  it('applies red color class to hearts and diamonds', () => {
    expect(renderToStaticMarkup(<PlayingCard suit="hearts" rank="A" />)).toContain('card-ui-red');
    expect(renderToStaticMarkup(<PlayingCard suit="diamonds" rank="A" />)).toContain('card-ui-red');
  });

  it('applies black color class to clubs and spades', () => {
    expect(renderToStaticMarkup(<PlayingCard suit="clubs" rank="A" />)).toContain('card-ui-black');
    expect(renderToStaticMarkup(<PlayingCard suit="spades" rank="A" />)).toContain('card-ui-black');
  });

  it('hides rank markers and shows face-down state when faceDown', () => {
    const html = renderToStaticMarkup(<PlayingCard suit="hearts" rank="A" faceDown />);
    expect(html).toContain('card-ui-face-down');
    expect(html).toContain('data-face-down="true"');
    expect(html).not.toContain('data-rank="A"');
  });

  it('applies selected class when selected is true', () => {
    const html = renderToStaticMarkup(<PlayingCard suit="spades" rank="K" selected />);
    expect(html).toContain('card-ui-selected');
  });

  it('does not apply selected class by default', () => {
    const html = renderToStaticMarkup(<PlayingCard suit="spades" rank="K" />);
    expect(html).not.toContain('card-ui-selected');
  });

  it('renders rank text in both corners (top-left and bottom-right)', () => {
    const html = renderToStaticMarkup(<PlayingCard suit="clubs" rank="Q" />);
    expect(html).toContain('card-ui-corner-tl');
    expect(html).toContain('card-ui-corner-br');
    const qMatches = html.match(/>Q</g) ?? [];
    expect(qMatches.length).toBeGreaterThanOrEqual(2);
  });

  it('exposes an aria-label describing the face-up card', () => {
    const html = renderToStaticMarkup(<PlayingCard suit="hearts" rank="10" />);
    expect(html).toContain('aria-label="10 of hearts"');
  });

  it('exposes an aria-label for face-down cards', () => {
    const html = renderToStaticMarkup(<PlayingCard suit="hearts" rank="10" faceDown />);
    expect(html).toContain('aria-label="face-down card"');
  });

  it('matches snapshot for canonical A of spades (md)', () => {
    const html = renderToStaticMarkup(<PlayingCard suit="spades" rank="A" size="md" />);
    expect(html).toMatchSnapshot();
  });
});
