import type { GameMeta } from '@repo/shared';
import { z } from 'zod';

export const meta: GameMeta = {
  id: 'texas-holdem',
  name: '德州扑克',
  description: '经典德州扑克，活用手牌与公共牌赢取筹码',
  minPlayers: 2,
  maxPlayers: 6,
  tags: ['卡牌', '策略'],
  icon: 'poker-hand',
  estimatedMinutes: 30,
  scene: {
    // Spotlight tightened but NOT over-corrected. v1 was 0.4 (too strong).
    // v2 was 0.16 + neutral (too weak, lost the poker-table warmth).
    // Settling at 0.24 + warm keeps the subtle centre-lift + table-light
    // feel without stage-spotlight overkill — per vision review.
    surface: { color: '#1f5233', texture: 'felt', accent: '#d4a056' },
    ambience: { type: 'spotlight', warmth: 'warm', intensity: 0.24 },
  },
  rules:
    '每人发 2 张底牌，配合 5 张公共牌组成最佳 5 张牌型。经过四轮下注（翻牌前、翻牌、转牌、河牌），最佳牌型或逼退所有对手者赢取底池。',
  agentRules: `Texas Hold'em poker. Each player gets 2 hole cards. 5 community cards dealt across 4 betting rounds: preflop(0), flop(3), turn(4), river(5).

Card format: "<rank><suit>" e.g. "As"=Ace of spades, "Td"=10 of diamonds. Ranks: 2-9, T, J, Q, K, A. Suits: s, h, d, c.

Actions:
  { "type": "fold" }                    — give up this hand
  { "type": "check" }                   — pass (only if no bet to call)
  { "type": "call" }                    — match current bet
  { "type": "raise", "amount": <int> }  — raise by this amount (total bet = current bet + amount). Must be >= minRaise.
  { "type": "all_in" }                  — bet all remaining chips

PlayerView fields:
  myHoleCards: [string, string]|null — your 2 cards (null if folded/eliminated)
  communityCards: string[] — 0-5 shared cards
  pot: number — total chips in pot
  players: { id, chips, currentBet, status: "active"|"folded"|"all_in"|"eliminated", cardCount, holeCards }[]
    holeCards: revealed at showdown, otherwise null
  currentPlayer: string
  bettingRound: "preflop"|"flop"|"turn"|"river"
  handPhase: "betting"|"showdown"|"hand_over"
  gamePhase: "playing"|"finished"
  bigBlind: number
  minRaise: number — minimum raise amount
  myChips: number
  myCurrentBet: number
  handNumber: number
  dealerIdx: number
  showdownResult: { playerId, handName, amount }[]|null
  winner: string|null

Win: last player with chips. Hand win: best 5-card poker hand or all others fold.
Hand rankings (high to low): Royal Flush, Straight Flush, Four of a Kind, Full House, Flush, Straight, Three of a Kind, Two Pair, One Pair, High Card.`,
};

// Dealer button and poker chip dot colors are canonical game-mechanic identities.
// The dealer "D" button and chip-count dots are always gold/brass regardless of theme.
// `bgClass`, `textClass`, `borderClass`, `ringClass` let Tailwind JIT pick up the classes;
// `bg`, `text`, `hex` expose raw hex for inline style objects.
export const POKER_CHIP_COLORS = {
  surface: { bg: '#f5ecd6', bgClass: 'bg-[#f5ecd6]', text: '#4a3528', textClass: 'text-[#4a3528]' },
  gold: {
    hex: '#8b6f3d',
    borderClass: 'border-[#8b6f3d]',
    textClass: 'text-[#8b6f3d]',
    ringClass: 'ring-[#8b6f3d]',
  },
} as const;

// ---- Card utilities ----

export const SUITS = ['s', 'h', 'd', 'c'] as const;
export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'] as const;

export type Card = string;

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push(rank + suit);
    }
  }
  return deck;
}

export function rankValue(rank: string): number {
  const idx = RANKS.indexOf(rank as (typeof RANKS)[number]);
  return idx + 2; // "2"=2, ..., "A"=14
}

export function parseCard(card: Card): { rank: number; suit: string } {
  const r = card.length === 3 ? card.slice(0, 2) : (card[0] ?? '');
  const s = card[card.length - 1] ?? '';
  return { rank: rankValue(r), suit: s };
}

export function suitSymbol(suit: string): string {
  const map: Record<string, string> = { s: '\u2660', h: '\u2665', d: '\u2666', c: '\u2663' };
  return map[suit] ?? suit;
}

/** SVG path data for each suit, viewBox 0 0 512 512. Credit: skoll / game-icons.net CC BY 3.0 */
export const SUIT_PATHS: Record<string, string> = {
  s: 'M458.915 307.705c0 62.63-54 91.32-91.34 91.34-41.64 0-73.1-18.86-91.83-34.26 2.47 50.95 14.53 87.35 68.65 116h-176.79c54.12-28.65 66.18-65.05 68.65-116-18.73 15.39-50.2 34.28-91.83 34.26-37.29 0-91.34-28.71-91.34-91.34 0-114.47 80.64-83.32 202.91-276.49 122.28 193.17 202.92 162.03 202.92 276.49z',
  h: 'M480.25 156.355c0 161.24-224.25 324.43-224.25 324.43S31.75 317.595 31.75 156.355c0-91.41 70.63-125.13 107.77-125.13 77.65 0 116.48 65.72 116.48 65.72s38.83-65.73 116.48-65.73c37.14.01 107.77 33.72 107.77 125.14z',
  d: 'M431.76 256c-69 42.24-137.27 126.89-175.76 224.78C217.51 382.89 149.25 298.24 80.24 256c69-42.24 137.27-126.89 175.76-224.78C294.49 129.11 362.75 213.76 431.76 256z',
  c: 'M477.443 295.143a104.45 104.45 0 0 1-202.26 36.67c-.08 68.73 4.33 114.46 69.55 149h-177.57c65.22-34.53 69.63-80.25 69.55-149a104.41 104.41 0 1 1-66.34-136.28 104.45 104.45 0 1 1 171.14 0 104.5 104.5 0 0 1 135.93 99.61z',
};

export function displayRank(card: Card): string {
  const rank = card.length === 3 ? card.slice(0, 2) : (card[0] ?? '');
  return rank === 'T' ? '10' : rank;
}

export function isRedSuit(suit: string): boolean {
  return suit === 'h' || suit === 'd';
}

// ---- Actions ----

export const ActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('fold') }),
  z.object({ type: z.literal('check') }),
  z.object({ type: z.literal('call') }),
  z.object({ type: z.literal('raise'), amount: z.number().int().min(1) }),
  z.object({ type: z.literal('all_in') }),
]);

export type Action = z.infer<typeof ActionSchema>;

// ---- Types ----

export type BettingRound = 'preflop' | 'flop' | 'turn' | 'river';
export type HandPhase = 'betting' | 'showdown' | 'hand_over';
export type GamePhase = 'playing' | 'finished';

export interface PlayerInfo {
  id: string;
  chips: number;
  currentBet: number;
  status: 'active' | 'folded' | 'all_in' | 'eliminated';
  cardCount: number;
  holeCards: [string, string] | null; // only own or if showdown
}

export interface PlayerView {
  myHoleCards: [string, string] | null;
  communityCards: string[];
  pot: number;
  players: PlayerInfo[];
  currentPlayer: string;
  bettingRound: BettingRound;
  handPhase: HandPhase;
  gamePhase: GamePhase;
  bigBlind: number;
  minRaise: number;
  myChips: number;
  myCurrentBet: number;
  winner: string | null;
  handNumber: number;
  dealerIdx: number;
  showdownResult: Array<{ playerId: string; handName: string; amount: number }> | null;
}
