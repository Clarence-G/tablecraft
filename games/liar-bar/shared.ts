import type { GameMeta } from '@repo/shared';
import { z } from 'zod';

export const meta: GameMeta = {
  id: 'liar-bar',
  name: '骗子酒馆',
  description: '用欺骗和运气赢得最后的生存',
  minPlayers: 2,
  maxPlayers: 6,
  tags: ['推理', '派对'],
  icon: 'Skull',
  estimatedMinutes: 20,
};

export type Card = 'Q' | 'K' | 'A' | 'Joker';
export type Suit = 'Q' | 'K' | 'A';

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
