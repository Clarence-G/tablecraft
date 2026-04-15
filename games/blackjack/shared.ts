import type { GameMeta } from '@repo/shared';
import { z } from 'zod';

export const meta: GameMeta = {
  id: 'blackjack',
  name: '21点',
  description: '对抗庄家，让手牌点数最接近21点',
  minPlayers: 1,
  maxPlayers: 6,
  tags: ['卡牌', '休闲'],
  icon: 'CreditCard',
  estimatedMinutes: 15,
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

export function cardValue(card: Card): number {
  const rank = card.slice(0, -1); // strip suit
  if (rank === 'A') return 11;
  if (['K', 'Q', 'J', 'T'].includes(rank)) return 10;
  return Number.parseInt(rank, 10);
}

export function handTotal(cards: Card[]): number {
  let total = 0;
  let aces = 0;
  for (const card of cards) {
    const val = cardValue(card);
    total += val;
    if (val === 11) aces++;
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return total;
}

export function isBlackjack(cards: Card[]): boolean {
  return cards.length === 2 && handTotal(cards) === 21;
}

export function isBusted(cards: Card[]): boolean {
  return handTotal(cards) > 21;
}

export function dealerShouldHit(cards: Card[]): boolean {
  return handTotal(cards) < 17;
}

export type Outcome = 'pending' | 'win' | 'lose' | 'push' | 'blackjack' | 'bust';

export function determineOutcome(playerCards: Card[], dealerCards: Card[]): Outcome {
  const playerTotal = handTotal(playerCards);
  const dealerTotal = handTotal(dealerCards);
  const playerBJ = isBlackjack(playerCards);
  const dealerBJ = isBlackjack(dealerCards);

  if (playerTotal > 21) return 'bust';
  if (playerBJ && dealerBJ) return 'push';
  if (playerBJ) return 'blackjack';
  if (dealerBJ) return 'lose';
  if (dealerTotal > 21) return 'win';
  if (playerTotal > dealerTotal) return 'win';
  if (playerTotal < dealerTotal) return 'lose';
  return 'push';
}

export function calculatePayout(outcome: Outcome, bet: number): number {
  switch (outcome) {
    case 'blackjack':
      return Math.floor(bet * 1.5);
    case 'win':
      return bet;
    case 'push':
      return 0;
    case 'lose':
    case 'bust':
      return -bet;
    default:
      return 0;
  }
}

// ---- Actions ----

export const ActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('bet'), amount: z.number().int().min(10).max(500) }),
  z.object({ type: z.literal('hit') }),
  z.object({ type: z.literal('stand') }),
  z.object({ type: z.literal('double_down') }),
]);

export type Action = z.infer<typeof ActionSchema>;

// ---- Player View ----

export interface PlayerInfo {
  id: string;
  chips: number;
  bet: number;
  cardCount: number;
  hand: Card[]; // own hand visible, others show empty array
  stood: boolean;
  busted: boolean;
  outcome: Outcome;
}

export interface PlayerView {
  myHand: Card[];
  dealerHand: Card[];
  dealerHiddenCard: boolean;
  players: PlayerInfo[];
  currentPlayer: string;
  phase: 'betting' | 'player_turns' | 'dealer_turn' | 'payout' | 'finished';
  myTotal: number;
  dealerTotal: number;
  winner: string | null;
  round: number;
}

export const MAX_ROUNDS = 13;
export const STARTING_CHIPS = 1000;
