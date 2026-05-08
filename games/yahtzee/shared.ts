import type { GameMeta } from '@repo/shared';
import { z } from 'zod';

export const meta: GameMeta = {
  id: 'yahtzee',
  name: '快艇骰子',
  description: '掷骰13轮，填满计分表，总分最高者获胜',
  minPlayers: 2,
  maxPlayers: 4,
  tags: ['骰子', '休闲'],
  icon: 'dice-six-faces-five',
  estimatedMinutes: 30,
  scene: {
    // Walnut-wood paper scene — replaced the dark navy leather. The user
    // preferred "paper-ish" over dark backgrounds for Yahtzee, matching the
    // vintage score-pad feel. Deep warm brown reads like a wood card table
    // underneath the cream scorecard; honey-gold accent unchanged.
    surface: { color: '#3d2f24', texture: 'paper', accent: '#f4c744' },
    ambience: { type: 'ambient', warmth: 'warm', intensity: 0.2 },
  },
  rules:
    '每回合掷 5 颗骰子，最多掷 3 次（可锁定部分骰子），然后选择一个计分类别填入得分。共 13 轮，总分最高者获胜。',
  agentRules: `5 dice, 13 rounds per player. Each turn: up to 3 rolls, hold/release dice between rolls, then score in one category.

Actions:
  { "type": "roll" }                        — roll all unheld dice (must have rollsLeft > 0)
  { "type": "hold", "diceIndex": <int 0-4> } — toggle hold on a die (only after first roll, before scoring)
  { "type": "score", "category": <int 0-12> } — score current dice in a category (must have rolled at least once)

Categories: 0=Ones, 1=Twos, 2=Threes, 3=Fours, 4=Fives, 5=Sixes (upper section, sum of matching dice),
  6=Three of a Kind (sum all if 3+ match), 7=Four of a Kind (sum all if 4+ match),
  8=Full House (25 pts, 3+2), 9=Small Straight (30 pts, 4 consecutive),
  10=Large Straight (40 pts, 5 consecutive), 11=Yahtzee (50 pts, all 5 same),
  12=Chance (sum all dice). Upper section bonus: +35 if upper sum >= 63.

PlayerView fields:
  dice: number[] — 5 values (1-6), [0,0,0,0,0] before first roll
  heldDice: boolean[] — 5 booleans
  rollsLeft: number — 0-3
  roundNumber: number — current round (1-13)
  currentPlayer: string
  phase: "rolling"|"scoring"|"finished"
  players: { id, scores: number[], yahtzeeBonus: number, totalScore: number }[]
    scores: 13-element array, -1=unfilled, >=0=scored value
  winner: string|null

Invalid: scoring an already-filled category, rolling with 0 rolls left, scoring before rolling.`,
};

export const NUM_DICE = 5;
export const MAX_ROLLS = 3;
export const NUM_CATEGORIES = 13;
export const UPPER_BONUS_THRESHOLD = 63;
export const UPPER_BONUS_VALUE = 35;
export const YAHTZEE_BONUS_VALUE = 100;

export const CATEGORY_NAMES_ZH = [
  '一点',
  '两点',
  '三点',
  '四点',
  '五点',
  '六点',
  '三条',
  '四条',
  '葫芦',
  '小顺子',
  '大顺子',
  '快艇',
  '机会',
];

export const ActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('roll') }),
  z.object({
    type: z.literal('hold'),
    diceIndex: z
      .number()
      .int()
      .min(0)
      .max(NUM_DICE - 1),
  }),
  z.object({
    type: z.literal('score'),
    category: z
      .number()
      .int()
      .min(0)
      .max(NUM_CATEGORIES - 1),
  }),
]);

export type Action = z.infer<typeof ActionSchema>;

export interface PlayerScore {
  id: string;
  scores: number[];
  yahtzeeBonus: number;
  totalScore: number;
}

export interface PlayerView {
  dice: number[];
  heldDice: boolean[];
  rollsLeft: number;
  roundNumber: number;
  currentPlayer: string;
  phase: 'rolling' | 'scoring' | 'finished';
  players: PlayerScore[];
  winner: string | null;
}

export function calculateScore(category: number, dice: number[]): number {
  const counts = Array(7).fill(0);
  for (const d of dice) {
    counts[d]++;
  }

  // Upper section: 0-5 (ones through sixes)
  if (category >= 0 && category <= 5) {
    const face = category + 1;
    return counts[face] * face;
  }

  const sorted = [...dice].sort((a, b) => a - b);

  // Three of a kind (cat 6)
  if (category === 6) {
    const hasThree = counts.some((c) => c >= 3);
    return hasThree ? dice.reduce((a, b) => a + b, 0) : 0;
  }

  // Four of a kind (cat 7)
  if (category === 7) {
    const hasFour = counts.some((c) => c >= 4);
    return hasFour ? dice.reduce((a, b) => a + b, 0) : 0;
  }

  // Full house (cat 8): 25 points
  if (category === 8) {
    const hasThree = counts.some((c) => c === 3);
    const hasTwo = counts.some((c) => c === 2);
    return hasThree && hasTwo ? 25 : 0;
  }

  // Small straight (cat 9): 4 consecutive, 30 points
  if (category === 9) {
    const unique = [...new Set(sorted)];
    const has1234 = [1, 2, 3, 4].every((n) => unique.includes(n));
    const has2345 = [2, 3, 4, 5].every((n) => unique.includes(n));
    const has3456 = [3, 4, 5, 6].every((n) => unique.includes(n));
    return has1234 || has2345 || has3456 ? 30 : 0;
  }

  // Large straight (cat 10): 5 consecutive, 40 points
  if (category === 10) {
    const is12345 = sorted.join('') === '12345';
    const is23456 = sorted.join('') === '23456';
    return is12345 || is23456 ? 40 : 0;
  }

  // Yahtzee (cat 11): all five the same, 50 points
  if (category === 11) {
    return counts.some((c) => c === 5) ? 50 : 0;
  }

  // Chance (cat 12): sum of all dice
  if (category === 12) {
    return dice.reduce((a, b) => a + b, 0);
  }

  return 0;
}

export function getUpperSectionSum(scores: number[]): number {
  let sum = 0;
  for (let i = 0; i < 6; i++) {
    if (scores[i] >= 0) {
      sum += scores[i];
    }
  }
  return sum;
}

export function calculateTotalScore(scores: number[], yahtzeeBonus: number): number {
  let total = 0;
  for (const s of scores) {
    if (s >= 0) {
      total += s;
    }
  }
  const upperSum = getUpperSectionSum(scores);
  if (upperSum >= UPPER_BONUS_THRESHOLD) {
    total += UPPER_BONUS_VALUE;
  }
  total += yahtzeeBonus * YAHTZEE_BONUS_VALUE;
  return total;
}

export function allCategoriesFilled(scores: number[]): boolean {
  return scores.every((s) => s >= 0);
}

// Decides whether the player's own scoresheet rows should render in the main
// panel. Keeping this pure lets us unit-test the invariant that viewing an
// opponent's scorecard (which does not mutate `showExpanded` or `isMyTurn`)
// can never cause the panel to collapse. The panel must also stay visible
// when `showExpanded` is true regardless of turn — that is what US-003 fixes.
export function shouldShowOwnScoreRows(showExpanded: boolean, isMyTurn: boolean): boolean {
  return showExpanded || isMyTurn;
}
