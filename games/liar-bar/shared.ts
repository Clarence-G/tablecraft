import type { GameMeta } from '@repo/shared';
import { z } from 'zod';

export const meta: GameMeta = {
  id: 'liar-bar',
  name: '骗子酒馆',
  description: '用欺骗和运气赢得最后的生存',
  minPlayers: 2,
  maxPlayers: 6,
  tags: ['推理', '派对'],
  icon: 'skull-slices',
  estimatedMinutes: 20,
  scene: {
    surface: { color: '#3a2418', texture: 'leather', accent: '#d94040' },
    ambience: { type: 'spotlight', warmth: 'warm', intensity: 0.28 },
  },
  rules:
    '每轮宣告一种牌型（Q/K/A），玩家轮流声称打出该牌型的牌（可以撒谎）。下家选择相信或质疑，被抓撒谎或错误质疑者扣动左轮手枪。最后存活者获胜。',
  agentRules: `Bluffing game with Russian roulette. Cards: Q, K, A, Joker. Each round declares a suit (Q, K, or A). Players play 1-3 cards face-down, claiming they are the declared suit. Next player believes or challenges.

Actions:
  When it's your turn to play:
    { "type": "play_cards", "cardIndices": [<int>, ...] } — 1-3 indices into your hand (0-based). Cards are played face-down.
  When previous player just played:
    { "type": "challenge" } — reveal their cards; if any card doesn't match declared suit (Joker always matches), they pull the trigger; otherwise you pull.
    { "type": "believe" }   — accept and it becomes your turn to play cards.

PlayerView fields:
  myHand: ("Q"|"K"|"A"|"Joker")[] — your cards
  players: { id, alive, cardCount, revolverChamber }[] — revolverChamber: how many times pulled (6-chamber revolver, 1 bullet)
  currentPlayer: string
  declaredSuit: "Q"|"K"|"A" — the suit declared this round
  phase: "playing"|"challenging"|"finished"
  lastPlay: { playerId, count }|null — who played and how many cards
  challengeResult: { playedCards[], wasLying, shooterId, shotDied, shotChamberIndex }|null
  winner: string|null

Win condition: last player alive. Eliminated when the bullet fires (1/6 chance each pull, guaranteed by chamber 6).`,
};

export type Card = 'Q' | 'K' | 'A' | 'Joker';
export type Suit = 'Q' | 'K' | 'A';

// Suit colors are canonical game-mechanic identities, not theme tokens.
// A Q stays blue across themes; a K stays purple. Intentionally hex
// literal so theme swaps cannot inadvertently break card recognition.
//
// `bgClass` is a Tailwind arbitrary-value class string so Tailwind's JIT
// can pick it up from this source file. It duplicates the `bg` hex
// because the PlayingCard API consumes a className, not a style object.
export const SUIT_COLORS = {
  Q: { bg: '#e8f0fe', bgClass: 'bg-[#e8f0fe]', border: '#2563eb', text: '#2563eb' },
  K: { bg: '#f0e8fe', bgClass: 'bg-[#f0e8fe]', border: '#7c3aed', text: '#7c3aed' },
  A: { bg: '#e8f8ee', bgClass: 'bg-[#e8f8ee]', border: '#16a34a', text: '#16a34a' },
  Joker: { bg: '#fde8e8', bgClass: 'bg-[#fde8e8]', border: '#d94040', text: '#d94040' },
} as const;

export const ActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('play_cards'),
    cardIndices: z.array(z.number().int().min(0)).min(1).max(3),
  }),
  z.object({
    type: z.literal('challenge'),
  }),
  z.object({
    type: z.literal('believe'),
  }),
]);

export type Action = z.infer<typeof ActionSchema>;

export interface PlayerInfo {
  id: string;
  alive: boolean;
  cardCount: number;
  revolverChamber: number;
}

export interface ChallengeResult {
  playedCards: Card[];
  wasLying: boolean;
  shooterId: string;
  shotDied: boolean;
  shotChamberIndex: number;
}

export interface PlayerView {
  myHand: Card[];
  players: PlayerInfo[];
  currentPlayer: string;
  declaredSuit: Suit;
  phase: 'playing' | 'challenging' | 'finished';
  lastPlay: { playerId: string; count: number } | null;
  winner: string | null;
  challengeResult: ChallengeResult | null;
}
