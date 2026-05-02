/**
 * Love Letter card art map.
 *
 * Images are generated via imagen.h-e.top (see scripts/imagen-hetop.sh + out/cards-v1/).
 * After batch completes, PNGs are moved to packages/client/public/card-art/love-letter/
 * and referenced by this map as public paths.
 *
 * Missing keys fall back to the text-only PlayingCard layout — safe to ship before
 * all 8 portraits + card-back are generated.
 */
export const LOVE_LETTER_CARD_ART: Record<number, string> = {
  1: '/card-art/love-letter/01-guard.png',
  2: '/card-art/love-letter/02-priest.png',
  3: '/card-art/love-letter/03-baron.png',
  4: '/card-art/love-letter/04-handmaid.png',
  5: '/card-art/love-letter/05-prince.png',
  6: '/card-art/love-letter/06-king.png',
  7: '/card-art/love-letter/07-countess.png',
  8: '/card-art/love-letter/08-princess.png',
};

export const LOVE_LETTER_CARD_BACK = '/card-art/love-letter/back.png';
