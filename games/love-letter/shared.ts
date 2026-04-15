import type { GameMeta } from '@repo/shared';
import { z } from 'zod';

export const meta: GameMeta = {
  id: 'love-letter',
  name: '情书',
  description: '推理与欺骗的微型卡牌游戏',
  minPlayers: 2,
  maxPlayers: 4,
  tags: ['推理', '卡牌'],
  icon: 'Heart',
  estimatedMinutes: 15,
};

// ---- Card Constants ----

export const CARD_NAMES: Record<number, string> = {
  1: '侍卫',
  2: '牧师',
  3: '男爵',
  4: '侍女',
  5: '王子',
  6: '国王',
  7: '伯爵夫人',
  8: '公主',
};

export const CARD_DESCRIPTIONS: Record<number, string> = {
  1: '猜一个人的手牌，猜对则淘汰',
  2: '偷看一个人的手牌',
  3: '和一个人比手牌，小的淘汰',
  4: '本轮不能被选为目标',
  5: '指定一人弃掉手牌重摸',
  6: '和一个人交换手牌',
  7: '持有国王或王子时必须打出',
  8: '被迫弃掉则出局',
};

export const CARD_COUNTS: Record<number, number> = {
  1: 5,
  2: 2,
  3: 2,
  4: 2,
  5: 2,
  6: 1,
  7: 1,
  8: 1,
};

/** Cards that require choosing another player as target */
export const TARGET_CARDS = [1, 2, 3, 5, 6] as const;

/** Cards that target other players (not self) and respect Handmaid protection */
export const OTHER_TARGET_CARDS = [1, 2, 3, 6] as const;

// ---- Action Schema ----

export const ActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('play_card'),
    card: z.number().int().min(1).max(8),
    target: z.string().optional(),
    guess: z.number().int().min(2).max(8).optional(),
  }),
]);
export type Action = z.infer<typeof ActionSchema>;

// ---- View Types ----

export interface PlayedCardEntry {
  playerId: string;
  card: number;
  target?: string;
  guess?: number;
  effect: string;
}

export interface PlayerViewInfo {
  id: string;
  alive: boolean;
  protected: boolean;
  playedCards: number[];
  cardCount: number;
}

export interface PlayerView {
  hand: number[];
  players: PlayerViewInfo[];
  currentPlayer: string;
  deckSize: number;
  playLog: PlayedCardEntry[];
  removedCards: number[];
  winner: string | null;
}
