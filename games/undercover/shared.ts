import type { GameMeta } from '@repo/shared';
import { z } from 'zod';

export const UndercoverConfigSchema = z.object({
  maxRounds: z.number().int().min(1).max(10).default(3),
});
export type UndercoverConfig = z.infer<typeof UndercoverConfigSchema>;
export const UNDERCOVER_DEFAULT_CONFIG: UndercoverConfig = { maxRounds: 3 };

export const meta: GameMeta = {
  id: 'undercover',
  name: '谁是卧底',
  description: '平民还是卧底？用语言隐藏与揭露，找出异类。',
  minPlayers: 3,
  maxPlayers: 12,
  tags: ['推理', '派对', '语言'],
  icon: 'UserX',
  estimatedMinutes: 10,
  configSchema: UndercoverConfigSchema,
  defaultConfig: UNDERCOVER_DEFAULT_CONFIG,
  scene: {
    surface: { color: '#1a1a2e', texture: 'felt', accent: '#e94560' },
    ambience: { type: 'spotlight', warmth: 'cool', intensity: 0.5 },
  },
  rules:
    '每人得到一个词：平民共享词A，卧底共享词B。轮流用一句话描述你的词，不能直接说出来。每轮描述结束后投票淘汰一人。消灭所有卧底则平民获胜；当卧底数量≥平民时卧底获胜。',
  agentRules: `Social deduction game with two secret word groups.
Roles: civilian (majority, share word A) vs undercover (minority, share word B, a related but different word).
Undercover count: 3-7 players → 1 undercover; 8-12 players → 2 undercovers.

Phases alternate: describe → vote → (elimination) → describe → ...

DESCRIBE phase: each alive player in seat order submits exactly one description per round.
  Action: { "type": "describe", "text": "<1-50 char clue>" }
  - Must be your turn (currentSpeaker === yourId)
  - Text must hint at your word without saying it directly
  - Max 50 characters

VOTE phase: each alive player votes to eliminate one other alive player.
  Action: { "type": "vote", "targetId": "<playerID>" }
  - Cannot vote for yourself
  - Cannot vote for eliminated players
  - Each player votes exactly once; cannot change vote

Win conditions:
  - All undercovers eliminated → civilians win
  - alive undercovers >= alive civilians → undercovers win

PlayerView fields:
  phase: 'describe' | 'vote' | 'finished'
  round: number
  myWord: string (your secret word)
  myRole: 'civilian' | 'undercover'
  myAlive: boolean
  currentSpeaker: string | null  (only in describe phase)
  descriptions: { playerId, text }[]  (current round descriptions so far)
  players: { id, alive, role: null | 'civilian' | 'undercover', hasDescribed, hasVoted }[]
  votes: { voterId, targetId }[]  (revealed after tally)
  tiePlayerIds: string[]  (non-empty if current describe is a tie re-describe)
  winner: 'civilian' | 'undercover' | null
  rankings: string[]`,
};

// ---- Action Schema ----
export const ActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('describe'),
    text: z.string().min(1).max(50),
  }),
  z.object({
    type: z.literal('vote'),
    targetId: z.string(),
  }),
]);
export type Action = z.infer<typeof ActionSchema>;

// ---- View Types ----

export interface PlayerInfo {
  id: string;
  alive: boolean;
  /** null until the player is eliminated or game ends */
  role: 'civilian' | 'undercover' | null;
  hasDescribed: boolean;
  hasVoted: boolean;
}

export interface DescriptionEntry {
  playerId: string;
  text: string;
}

export interface VoteEntry {
  voterId: string;
  targetId: string;
}

export interface PlayerView {
  phase: 'describe' | 'vote' | 'finished';
  round: number;
  myWord: string;
  myRole: 'civilian' | 'undercover' | null;
  myAlive: boolean;
  currentSpeaker: string | null;
  descriptions: DescriptionEntry[];
  players: PlayerInfo[];
  votes: VoteEntry[];
  /** non-empty when current describe is a tie-breaking re-describe */
  tiePlayerIds: string[];
  winner: 'civilian' | 'undercover' | null;
  rankings: string[];
}
