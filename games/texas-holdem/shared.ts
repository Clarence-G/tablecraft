import type { GameMeta } from '@repo/shared';
import { z } from 'zod';

export const meta: GameMeta = {
  id: 'texas-holdem',
  name: '德州扑克',
  description: '经典德州扑克，活用手牌与公共牌赢取筹码',
  minPlayers: 2,
  maxPlayers: 6,
  tags: ['卡牌', '策略'],
  icon: 'LayoutGrid',
  estimatedMinutes: 30,
};

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
