import type { GameMeta } from '@repo/shared';
import { z } from 'zod';

// ---- Meta ----

export const meta: GameMeta = {
  id: 'splendor',
  name: '璀璨宝石',
  description: '收集宝石、购买矿车与商船、吸引贵族，率先达 15 声望。',
  minPlayers: 2,
  maxPlayers: 4,
  tags: ['策略', '卡牌'],
  icon: 'gem',
  estimatedMinutes: 30,
  scene: {
    surface: { color: '#3a2c3c', texture: 'velvet', accent: '#d4a056' },
    ambience: { type: 'ambient', warmth: 'warm', intensity: 0.3 },
  },
  rules:
    '每回合选择一个动作：(1) 取 3 颗不同颜色的宝石；(2) 取 2 颗同色宝石（该堆需至少 4 颗）；(3) 预订一张可见或牌堆顶的卡并获得 1 颗黄金；(4) 购买一张可见或预订卡（可用黄金替代任意宝石）。每张卡提供固定的宝石折扣；若你的折扣满足贵族需求，贵族自动加入你的庄园（+3 声望）。回合结束时若持有宝石超过 10 枚，必须丢弃多余。率先达到 15 声望时，当前轮完整打完后结算，声望最高者胜（同分则卡牌最少者胜）。',
  agentRules: `2-4 players. First to 15 prestige points wins (after current round completes).

Gem types: white, blue, green, red, black, gold (wildcard, never as cost).
Supply counts by player count: 2p=4 each color + 5 gold, 3p=5, 4p=7.
Cards: 90 total across 3 levels (L1=40, L2=30, L3=20). 4 face-up per level.
Nobles: (players+1) at start. Visiting requires bonus counts (not gems).

Actions:
  { "type": "take_three", "colors": ["white","blue","green"], "discard"?: { "<color>": <n>, ... } }
    colors must be exactly 3 distinct non-gold colors (fewer allowed only if supply forces).
    discard required iff total gems after take > 10.
  { "type": "take_two", "color": "<non-gold>", "discard"?: {...} }
    supply of color must be >= 4.
  { "type": "reserve", "source": "visible" | "deck", "level": 1|2|3, "cardId"?: "<id>", "discard"?: {...} }
    visible requires cardId; deck takes top of that level's deck.
    gain 1 gold if supply has any. max 3 reserved.
  { "type": "buy", "source": "visible" | "reserved", "cardId": "<id>", "gold"?: { "<color>": <n>, ... }, "claimNoble"?: "<nobleId>" }
    cost reduced by your bonuses; pay remainder from your gems.
    gold[color]=n spends n gold tokens for color gems you're short of.
    if >=2 nobles visitable after buy, claimNoble required.

PlayerView fields:
  supply: { white, blue, green, red, black, gold }
  visible: { 1: Card[], 2: Card[], 3: Card[] } (up to 4 per level; nulls when deck empty)
  deckCounts: { 1, 2, 3 }
  nobles: Noble[]
  players: { id, gems, bonuses, points, reservedCount, noblesCount, cardCount }[]
  myReserved: Card[] (only yours — others' reserved cards are hidden)
  currentPlayer: string
  lastRoundStartedBy: string | null (set when someone first reaches 15)
  winner: string | null

Card: { id, level, bonus: <color>, points, cost: { <color>: <n>, ... } }
Noble: { id, points: 3, requires: { <color>: <n>, ... } }`,
};

// ---- Gem Types ----

export const GEMS = ['white', 'blue', 'green', 'red', 'black'] as const;
export type Gem = (typeof GEMS)[number];
export type Token = Gem | 'gold';
export const TOKENS: readonly Token[] = [...GEMS, 'gold'] as const;

export type GemCount = Record<Gem, number>;
export type TokenCount = Record<Token, number>;

export function emptyGemCount(): GemCount {
  return { white: 0, blue: 0, green: 0, red: 0, black: 0 };
}
export function emptyTokenCount(): TokenCount {
  return { white: 0, blue: 0, green: 0, red: 0, black: 0, gold: 0 };
}

// ---- Cards & Nobles ----

export interface Card {
  id: string;
  level: 1 | 2 | 3;
  bonus: Gem;
  points: number;
  cost: GemCount;
}

export interface Noble {
  id: string;
  points: number;
  requires: GemCount;
}

// Canonical "others" order for each bonus color — starts from next in GEMS cycle.
const OTHERS: Record<Gem, Gem[]> = {
  white: ['blue', 'green', 'red', 'black'],
  blue: ['green', 'red', 'black', 'white'],
  green: ['red', 'black', 'white', 'blue'],
  red: ['black', 'white', 'blue', 'green'],
  black: ['white', 'blue', 'green', 'red'],
};

// Templates: [points, c0, c1, c2, c3] where c0..c3 map to OTHERS[bonus].
const L1_TEMPLATES: number[][] = [
  [0, 1, 1, 1, 1],
  [0, 2, 1, 1, 1],
  [0, 2, 2, 1, 0],
  [0, 3, 0, 0, 0],
  [0, 0, 0, 0, 3],
  [0, 2, 1, 0, 0],
  [0, 1, 0, 2, 2],
  [1, 4, 0, 0, 0],
];

const L2_TEMPLATES: number[][] = [
  [1, 3, 2, 2, 0],
  [1, 0, 4, 2, 1],
  [2, 5, 0, 0, 0],
  [2, 2, 0, 3, 3],
  [2, 5, 0, 0, 1],
  [3, 6, 0, 0, 0],
];

const L3_TEMPLATES: number[][] = [
  [3, 3, 5, 3, 0],
  [4, 0, 3, 6, 3],
  [4, 7, 0, 0, 0],
  [5, 7, 3, 0, 0],
];

function buildCardsFromTemplates(level: 1 | 2 | 3, templates: number[][], prefix: string): Card[] {
  const cards: Card[] = [];
  for (const bonus of GEMS) {
    const others = OTHERS[bonus];
    templates.forEach((tpl, idx) => {
      const [points, ...costs] = tpl;
      const cost = emptyGemCount();
      others.forEach((c, i) => {
        cost[c] = costs[i] ?? 0;
      });
      cards.push({
        id: `${prefix}-${bonus[0].toUpperCase()}${idx + 1}`,
        level,
        bonus,
        points,
        cost,
      });
    });
  }
  return cards;
}

export const ALL_CARDS: Card[] = [
  ...buildCardsFromTemplates(1, L1_TEMPLATES, 'L1'),
  ...buildCardsFromTemplates(2, L2_TEMPLATES, 'L2'),
  ...buildCardsFromTemplates(3, L3_TEMPLATES, 'L3'),
];

export const ALL_NOBLES: Noble[] = [
  { id: 'N1', points: 3, requires: { ...emptyGemCount(), white: 4, blue: 4 } },
  { id: 'N2', points: 3, requires: { ...emptyGemCount(), blue: 4, green: 4 } },
  { id: 'N3', points: 3, requires: { ...emptyGemCount(), green: 4, red: 4 } },
  { id: 'N4', points: 3, requires: { ...emptyGemCount(), red: 4, black: 4 } },
  { id: 'N5', points: 3, requires: { ...emptyGemCount(), black: 4, white: 4 } },
  { id: 'N6', points: 3, requires: { ...emptyGemCount(), white: 3, blue: 3, green: 3 } },
  { id: 'N7', points: 3, requires: { ...emptyGemCount(), blue: 3, green: 3, red: 3 } },
  { id: 'N8', points: 3, requires: { ...emptyGemCount(), green: 3, red: 3, black: 3 } },
  { id: 'N9', points: 3, requires: { ...emptyGemCount(), red: 3, black: 3, white: 3 } },
  { id: 'N10', points: 3, requires: { ...emptyGemCount(), black: 3, white: 3, blue: 3 } },
];

// ---- Configuration ----

export const WIN_POINTS = 15;
export const MAX_GEMS = 10;
export const MAX_RESERVED = 3;
export const VISIBLE_PER_LEVEL = 4;
export const GOLD_PER_GAME = 5;

export function supplyPerColor(playerCount: number): number {
  if (playerCount <= 2) return 4;
  if (playerCount === 3) return 5;
  return 7;
}

export function noblesCount(playerCount: number): number {
  return playerCount + 1;
}

// ---- Action Schema ----

const gemColor = z.enum(GEMS);
const tokenColor = z.enum(['white', 'blue', 'green', 'red', 'black', 'gold']);
const gemCountInput = z.record(gemColor, z.number().int().nonnegative()).optional();

export const ActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('take_three'),
    colors: z.array(gemColor).min(1).max(3),
    discard: z.record(tokenColor, z.number().int().nonnegative()).optional(),
  }),
  z.object({
    type: z.literal('take_two'),
    color: gemColor,
    discard: z.record(tokenColor, z.number().int().nonnegative()).optional(),
  }),
  z.object({
    type: z.literal('reserve'),
    source: z.enum(['visible', 'deck']),
    level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    cardId: z.string().optional(),
    discard: z.record(tokenColor, z.number().int().nonnegative()).optional(),
  }),
  z.object({
    type: z.literal('buy'),
    source: z.enum(['visible', 'reserved']),
    cardId: z.string(),
    gold: gemCountInput,
    claimNoble: z.string().optional(),
  }),
]);
export type Action = z.infer<typeof ActionSchema>;

// ---- View ----

export interface PlayerInfo {
  id: string;
  gems: TokenCount;
  bonuses: GemCount;
  points: number;
  reservedCount: number;
  noblesCount: number;
  cardCount: number;
}

export interface PlayerView {
  supply: TokenCount;
  visible: Record<1 | 2 | 3, (Card | null)[]>;
  deckCounts: Record<1 | 2 | 3, number>;
  nobles: Noble[];
  players: PlayerInfo[];
  myReserved: Card[];
  currentPlayer: string;
  lastRoundStartedBy: string | null;
  winner: string | null;
}
