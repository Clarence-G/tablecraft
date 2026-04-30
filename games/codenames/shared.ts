import type { GameMeta } from '@repo/shared';
import { z } from 'zod';

export const meta: GameMeta = {
  id: 'codenames',
  name: '行动代码',
  description: '两支团队各有间谍头目与特工，凭单词线索找出己方阵营的全部目标',
  minPlayers: 4,
  maxPlayers: 8,
  tags: ['推理', '团队', '派对'],
  icon: 'Lightbulb',
  estimatedMinutes: 15,
  scene: {
    surface: { color: '#f5f0e8', texture: 'paper', accent: '#8b6f47' },
    ambience: { type: 'ambient', warmth: 'warm', intensity: 0.15 },
  },
  agentRules: `Two-team deduction game. Teams: red and blue. Each team has one spymaster and 1+ operatives.

Phases:
1. setup — players call joinTeam to pick team/role, then anyone calls commitTeams once both teams are valid
2. clue — active team's spymaster calls giveClue
3. guess — active team's operatives call guess (or endGuessing to pass)

Actions:
  { "type": "joinTeam", "team": "red"|"blue", "role": "spymaster"|"operative" }
  { "type": "commitTeams" }  — only when both teams have spymaster + operative
  { "type": "giveClue", "word": "<clue>", "count": 0-9|"unlimited" }
    - spymaster only during clue phase; word must not contain any board word as substring
  { "type": "guess", "cellIndex": 0-24 }  — operative only during guess phase
  { "type": "endGuessing" }  — operative ends turn; requires >=1 guess unless count was 0

PlayerView fields:
  phase: "setup"|"clue"|"guess"|"over"
  board: CellView[]|null  — null during setup. CellView: { word, revealed, color }
    color: "red"|"blue"|"bystander"|"assassin"|null  — null for unrevealed cells (operatives only)
    spymasters see all colors; operatives only see color if revealed
  activeTeam: "red"|"blue"|null
  firstTeam: "red"|"blue"|null  — team with 9 tiles
  currentClue: { word, count }|null
  guessesUsed: number
  maxGuesses: number|"unlimited"
  redRemaining: number  — unrevealed red tiles
  blueRemaining: number
  myTeam: "red"|"blue"|null
  myRole: "spymaster"|"operative"|null
  playersInfo: { id, team, role }[]
  winner: "red"|"blue"|null

Win: first team to reveal all their tiles wins. Assassin revealed → opposing team wins.`,
};

export type Team = 'red' | 'blue';
export type Role = 'spymaster' | 'operative';
export type CardType = 'red' | 'blue' | 'bystander' | 'assassin';

// ---- Action Schema ----
export const ActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('joinTeam'),
    team: z.enum(['red', 'blue']),
    role: z.enum(['spymaster', 'operative']),
  }),
  z.object({ type: z.literal('commitTeams') }),
  z.object({
    type: z.literal('giveClue'),
    word: z.string(),
    count: z.union([z.number().int().min(0).max(9), z.literal('unlimited')]),
  }),
  z.object({
    type: z.literal('guess'),
    cellIndex: z.number().int().min(0).max(24),
  }),
  z.object({ type: z.literal('endGuessing') }),
]);
export type Action = z.infer<typeof ActionSchema>;

// ---- View (what each player sees) ----
export interface CellView {
  word: string;
  revealed: boolean;
  color: CardType | null; // null for unrevealed cells visible to operatives
}

export interface PlayerTeamInfo {
  id: string;
  team: Team | null;
  role: Role | null;
}

export interface PlayerView {
  phase: 'setup' | 'clue' | 'guess' | 'over';
  board: CellView[] | null; // null during setup
  activeTeam: Team | null;
  firstTeam: Team | null;
  currentClue: { word: string; count: number | 'unlimited' } | null;
  guessesUsed: number;
  maxGuesses: number | 'unlimited';
  redRemaining: number;
  blueRemaining: number;
  myTeam: Team | null;
  myRole: Role | null;
  playersInfo: PlayerTeamInfo[];
  winner: Team | null;
}
