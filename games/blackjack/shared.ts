import type { GameMeta } from '@repo/shared';
import { z } from 'zod';

export const meta: GameMeta = {
  id: 'blackjack',
  name: '21点',
  description: '对抗庄家，让手牌点数最接近21点',
  minPlayers: 1,
  maxPlayers: 6,
  tags: ['卡牌', '休闲'],
  icon: 'card-ace-spades',
  estimatedMinutes: 15,
  rules: '所有玩家对抗庄家。先下注，然后通过要牌使手牌点数尽量接近 21 点但不超过。A 可算 1 或 11，J/Q/K 算 10。超过 21 点即爆牌出局。',
  agentRules: `Players vs dealer. Multi-round: bet → play → dealer reveals → payout.
Cards: A=1 or 11 (best for hand), 2-9=face value, T/J/Q/K=10. Card format: "<rank><suit>" e.g. "As"=Ace of spades, "Th"=10 of hearts. Suits: s=spade, h=heart, d=diamond, c=club.

Actions:
  Betting phase:  { "type": "bet", "amount": <int 10-500> }
  Player turn:    { "type": "hit" }           — draw one card
                  { "type": "stand" }         — stop drawing
                  { "type": "double_down" }   — double bet, draw exactly one card, then auto-stand

PlayerView fields:
  phase: "betting"|"player_turns"|"dealer_turn"|"payout"|"finished"
  currentPlayer: string
  round: number
  myHand: string[] — your cards
  myTotal: number — best hand value (aces optimized)
  dealerHand: string[] — dealer's visible cards
  dealerHiddenCard: boolean — true if dealer still has a face-down card
  dealerTotal: number — dealer's visible total
  players: { id, chips, bet, cardCount, hand[], stood, busted, outcome }[]
  winner: string|null — player with most chips when game ends

Win condition: have the most chips when rounds end.
Bust: hand total > 21. Dealer must hit on 16 or below, stand on 17+.`,
};

// ---- Card utilities ----

export const SUITS = ['s', 'h', 'd', 'c'] as const;

/** SVG path data for each suit, viewBox 0 0 512 512. Credit: skoll / game-icons.net CC BY 3.0 */
export const SUIT_PATHS: Record<string, string> = {
  s: 'M458.915 307.705c0 62.63-54 91.32-91.34 91.34-41.64 0-73.1-18.86-91.83-34.26 2.47 50.95 14.53 87.35 68.65 116h-176.79c54.12-28.65 66.18-65.05 68.65-116-18.73 15.39-50.2 34.28-91.83 34.26-37.29 0-91.34-28.71-91.34-91.34 0-114.47 80.64-83.32 202.91-276.49 122.28 193.17 202.92 162.03 202.92 276.49z',
  h: 'M480.25 156.355c0 161.24-224.25 324.43-224.25 324.43S31.75 317.595 31.75 156.355c0-91.41 70.63-125.13 107.77-125.13 77.65 0 116.48 65.72 116.48 65.72s38.83-65.73 116.48-65.73c37.14.01 107.77 33.72 107.77 125.14z',
  d: 'M431.76 256c-69 42.24-137.27 126.89-175.76 224.78C217.51 382.89 149.25 298.24 80.24 256c69-42.24 137.27-126.89 175.76-224.78C294.49 129.11 362.75 213.76 431.76 256z',
  c: 'M477.443 295.143a104.45 104.45 0 0 1-202.26 36.67c-.08 68.73 4.33 114.46 69.55 149h-177.57c65.22-34.53 69.63-80.25 69.55-149a104.41 104.41 0 1 1-66.34-136.28 104.45 104.45 0 1 1 171.14 0 104.5 104.5 0 0 1 135.93 99.61z',
};
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
