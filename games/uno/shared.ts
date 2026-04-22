import type { GameMeta } from '@repo/shared';
import { z } from 'zod';

export const meta: GameMeta = {
  id: 'uno',
  name: 'UNO',
  description: '快速出完手牌，先出完者获胜',
  minPlayers: 2,
  maxPlayers: 6,
  tags: ['卡牌', '派对'],
  icon: 'card-exchange',
  estimatedMinutes: 20,
  rules:
    '出牌必须与弃牌堆顶的颜色或数字匹配，或使用万能牌。无法出牌时必须摸牌。出完所有手牌的玩家获胜。',
  agentRules: `Card shedding game. Match top discard by color or value, or play a wild card. First to empty hand wins.

Card format: "<color>_<value>" e.g. "red_5", "blue_skip", "wild", "wild_draw_four".
Colors: red, blue, green, yellow. Special values: skip, reverse, draw_two. Wild cards: wild, wild_draw_four.

Actions:
  { "type": "play_card", "cardIndex": <int>, "chosenColor": "red"|"blue"|"green"|"yellow" }
    — cardIndex: 0-based index into myHand. chosenColor: required only for wild/wild_draw_four cards.
  { "type": "draw_card" }  — draw one card from pile (when you can't or don't want to play)
  { "type": "pass" }       — pass turn (only after drawing a card this turn, if drawn card can't be played)

PlayerView fields:
  myHand: string[] — your cards (serialized format)
  topCard: string — top of discard pile
  activeColor: "red"|"blue"|"green"|"yellow" — current active color
  drawPileCount: number — cards remaining in draw pile
  players: { id, cardCount }[]
  currentPlayer: string
  direction: 1|-1 — play direction (1=clockwise, -1=counter-clockwise)
  phase: "playing"|"finished"
  hasDrawnThisTurn: boolean — true if you already drew this turn
  winner: string|null

Play rules: card must match activeColor or top card's value. Wild can always be played. Skip/Reverse/Draw Two have special effects.
Invalid: playing a card that doesn't match, passing without drawing first.`,
};

// ---- Card Types ----

export type UnoColor = 'red' | 'blue' | 'green' | 'yellow';
export type UnoColorChoice = UnoColor;
export type NumberValue = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export type ActionType = 'skip' | 'reverse' | 'draw_two';
export type WildType = 'wild' | 'wild_draw_four';

export interface NumberCard {
  type: 'number';
  color: UnoColor;
  value: NumberValue;
}

export interface ActionCard {
  type: 'action';
  color: UnoColor;
  action: ActionType;
}

export interface WildCard {
  type: 'wild';
  color: 'wild';
  action: WildType;
}

export type UnoCard = NumberCard | ActionCard | WildCard;

// ---- Constants ----

export const COLORS: UnoColor[] = ['red', 'blue', 'green', 'yellow'];
export const INITIAL_HAND_SIZE = 7;
export const DRAW_TWO_COUNT = 2;
export const WILD_DRAW_FOUR_COUNT = 4;

// ---- Serialization ----

export function serializeCard(card: UnoCard): string {
  if (card.type === 'wild') {
    return card.action;
  }
  if (card.type === 'action') {
    return `${card.color}_${card.action}`;
  }
  return `${card.color}_${card.value}`;
}

export function deserializeCard(s: string): UnoCard {
  if (s === 'wild') {
    return { type: 'wild', color: 'wild', action: 'wild' };
  }
  if (s === 'wild_draw_four') {
    return { type: 'wild', color: 'wild', action: 'wild_draw_four' };
  }
  const idx = s.indexOf('_');
  const color = s.substring(0, idx) as UnoColor;
  const rest = s.substring(idx + 1);
  const num = Number.parseInt(rest, 10);
  if (!Number.isNaN(num)) {
    return { type: 'number', color, value: num as NumberValue };
  }
  return { type: 'action', color, action: rest as ActionType };
}

// ---- Action Schema ----

export const ActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('play_card'),
    cardIndex: z.number().int().min(0),
    chosenColor: z.enum(['red', 'blue', 'green', 'yellow']).optional(),
  }),
  z.object({
    type: z.literal('draw_card'),
  }),
  z.object({
    type: z.literal('pass'),
  }),
]);

export type Action = z.infer<typeof ActionSchema>;

// ---- View Types ----

export interface PlayerInfo {
  id: string;
  cardCount: number;
  connected?: boolean;
}

export interface PlayerView {
  myHand: string[];
  topCard: string;
  activeColor: UnoColor;
  drawPileCount: number;
  players: PlayerInfo[];
  currentPlayer: string;
  direction: 1 | -1;
  phase: 'playing' | 'finished';
  winner: string | null;
  hasDrawnThisTurn: boolean;
}
