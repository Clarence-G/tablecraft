import type { ActionResult, EngineEvent, GameContext, GameLogic } from '@repo/shared';
import { logAction, logSystem } from '@repo/shared';
import {
  type Action,
  ActionSchema,
  type CardType,
  type PlayerTeamInfo,
  type PlayerView,
  type Role,
  type Team,
} from './shared';

import enWords from './i18n/en/words.json';
import zhWords from './i18n/zh/words.json';

// ---- Internal State ----

interface PlayerAssignment {
  team: Team;
  role: Role;
}

interface CodenamesState {
  phase: 'setup' | 'clue' | 'guess' | 'over';
  locale: 'zh' | 'en';
  players: string[];
  assignments: Record<string, PlayerAssignment | undefined>;
  // Board (null until commitTeams)
  words: string[] | null;
  keycard: CardType[] | null;
  revealed: boolean[] | null;
  // Turn tracking
  activeTeam: Team | null;
  firstTeam: Team | null;
  currentClue: { word: string; count: number | 'unlimited' } | null;
  guessesUsed: number;
  maxGuesses: number | 'unlimited';
  // Score totals
  redTotal: number;
  blueTotal: number;
  winner: Team | null;
}

function otherTeam(team: Team): Team {
  return team === 'red' ? 'blue' : 'red';
}

function countRemaining(state: CodenamesState, team: Team): number {
  if (!state.keycard || !state.revealed) return 0;
  return state.keycard.filter((c, i) => c === team && !state.revealed![i]).length;
}

function endTurn(state: CodenamesState): CodenamesState {
  const next = otherTeam(state.activeTeam!);
  return {
    ...state,
    phase: 'clue',
    activeTeam: next,
    currentClue: null,
    guessesUsed: 0,
    maxGuesses: 0,
  };
}

function buildWinResult(
  state: CodenamesState,
  winningTeam: Team,
  events: EngineEvent[],
): ActionResult<CodenamesState> {
  const newState: CodenamesState = { ...state, phase: 'over', winner: winningTeam };
  const winnerSpymaster = newState.players.find(
    (p) =>
      newState.assignments[p]?.team === winningTeam &&
      newState.assignments[p]?.role === 'spymaster',
  );
  events.push(
    logSystem('log.win', {
      actorId: winnerSpymaster,
      messageParams: { team: winningTeam },
    }),
  );
  const winners = newState.players.filter((p) => newState.assignments[p]?.team === winningTeam);
  const losers = newState.players.filter((p) => newState.assignments[p]?.team !== winningTeam);
  events.push({ type: 'END_GAME', rankings: [...winners, ...losers] });
  return { ok: true, state: newState, events };
}

export const logic: GameLogic<CodenamesState, Action, PlayerView> = {
  actions: ActionSchema,

  setup(ctx: GameContext, config?: unknown): CodenamesState {
    const locale = (config as { locale?: string } | null)?.locale === 'en' ? 'en' : 'zh';
    const assignments: Record<string, PlayerAssignment | undefined> = {};
    for (const p of ctx.players) {
      assignments[p] = undefined;
    }
    return {
      phase: 'setup',
      locale,
      players: ctx.players,
      assignments,
      words: null,
      keycard: null,
      revealed: null,
      activeTeam: null,
      firstTeam: null,
      currentClue: null,
      guessesUsed: 0,
      maxGuesses: 0,
      redTotal: 0,
      blueTotal: 0,
      winner: null,
    };
  },

  onAction(state, action, playerID, ctx): ActionResult<CodenamesState> {
    if (state.phase === 'over') {
      return { ok: false, reason: 'Game already over' };
    }

    // ---- joinTeam ----
    if (action.type === 'joinTeam') {
      if (state.phase !== 'setup') {
        return { ok: false, reason: 'Cannot change teams after game starts' };
      }
      if (action.role === 'spymaster') {
        const existingSpymaster = state.players.find(
          (p) =>
            p !== playerID &&
            state.assignments[p]?.team === action.team &&
            state.assignments[p]?.role === 'spymaster',
        );
        if (existingSpymaster) {
          return { ok: false, reason: 'Team already has a spymaster' };
        }
      }
      const newState: CodenamesState = {
        ...state,
        assignments: { ...state.assignments, [playerID]: { team: action.team, role: action.role } },
      };
      return {
        ok: true,
        state: newState,
        events: [logAction(playerID, 'log.joinTeam', { team: action.team, role: action.role })],
      };
    }

    // ---- commitTeams ----
    if (action.type === 'commitTeams') {
      if (state.phase !== 'setup') {
        return { ok: false, reason: 'Teams already committed' };
      }
      const redPlayers = state.players.filter((p) => state.assignments[p]?.team === 'red');
      const bluePlayers = state.players.filter((p) => state.assignments[p]?.team === 'blue');
      const redSpy = redPlayers.find((p) => state.assignments[p]?.role === 'spymaster');
      const blueSpy = bluePlayers.find((p) => state.assignments[p]?.role === 'spymaster');
      const redOp = redPlayers.find((p) => state.assignments[p]?.role === 'operative');
      const blueOp = bluePlayers.find((p) => state.assignments[p]?.role === 'operative');
      if (!redSpy || !blueSpy || !redOp || !blueOp) {
        return { ok: false, reason: 'Both teams need a spymaster and at least one operative' };
      }

      const wordPool: string[] = state.locale === 'en' ? [...enWords] : [...zhWords];
      const shuffled = ctx.random.shuffle(wordPool);
      const selectedWords = shuffled.slice(0, 25);

      const firstTeam: Team = ctx.random.int(0, 1) === 0 ? 'red' : 'blue';
      const secondTeam = otherTeam(firstTeam);

      const keycardEntries: CardType[] = [
        ...Array<CardType>(9).fill(firstTeam),
        ...Array<CardType>(8).fill(secondTeam),
        ...Array<CardType>(7).fill('bystander'),
        'assassin' as CardType,
      ];
      const keycard = ctx.random.shuffle(keycardEntries) as CardType[];
      const revealed = Array<boolean>(25).fill(false);

      const newState: CodenamesState = {
        ...state,
        phase: 'clue',
        words: selectedWords,
        keycard,
        revealed,
        firstTeam,
        activeTeam: firstTeam,
        redTotal: firstTeam === 'red' ? 9 : 8,
        blueTotal: firstTeam === 'blue' ? 9 : 8,
        currentClue: null,
        guessesUsed: 0,
        maxGuesses: 0,
      };

      return {
        ok: true,
        state: newState,
        events: [logSystem('log.gameStart', { messageParams: { firstTeam } })],
      };
    }

    // ---- giveClue ----
    if (action.type === 'giveClue') {
      if (state.phase !== 'clue') {
        return { ok: false, reason: 'Not in clue phase' };
      }
      const myAssign = state.assignments[playerID];
      if (!myAssign || myAssign.role !== 'spymaster' || myAssign.team !== state.activeTeam) {
        return { ok: false, reason: 'Only active team spymaster can give a clue' };
      }
      const clueWord = action.word.trim();
      if (!clueWord) {
        return { ok: false, reason: 'Clue word cannot be empty' };
      }
      const clueLower = clueWord.toLowerCase();
      const boardMatch = state.words!.find((w) => {
        const wLower = w.toLowerCase();
        return clueLower.includes(wLower) || wLower.includes(clueLower);
      });
      if (boardMatch) {
        return { ok: false, reason: 'Clue word cannot contain or be contained by a board word' };
      }
      const maxGuesses: number | 'unlimited' =
        action.count === 'unlimited' ? 'unlimited' : action.count + 1;
      const newState: CodenamesState = {
        ...state,
        phase: 'guess',
        currentClue: { word: clueWord, count: action.count },
        guessesUsed: 0,
        maxGuesses,
      };
      return {
        ok: true,
        state: newState,
        events: [logAction(playerID, 'log.clue', { word: clueWord, count: String(action.count) })],
      };
    }

    // ---- guess ----
    if (action.type === 'guess') {
      if (state.phase !== 'guess') {
        return { ok: false, reason: 'Not in guess phase' };
      }
      const myAssign = state.assignments[playerID];
      if (!myAssign || myAssign.role !== 'operative' || myAssign.team !== state.activeTeam) {
        return { ok: false, reason: 'Only active team operatives can guess' };
      }
      const { cellIndex } = action;
      if (state.revealed![cellIndex]) {
        return { ok: false, reason: 'Cell already revealed' };
      }

      const card = state.keycard![cellIndex];
      const newRevealed = [...state.revealed!];
      newRevealed[cellIndex] = true;
      let newState: CodenamesState = {
        ...state,
        revealed: newRevealed,
        guessesUsed: state.guessesUsed + 1,
      };

      const events: EngineEvent[] = [];

      let result: string;
      if (card === state.activeTeam) result = 'own';
      else if (card === 'bystander') result = 'bystander';
      else if (card === 'assassin') result = 'assassin';
      else result = 'opponent';

      events.push(
        logAction(playerID, 'log.guess', {
          cell: String(cellIndex),
          result,
          word: state.words![cellIndex],
        }),
      );

      if (card === 'assassin') {
        return buildWinResult(newState, otherTeam(state.activeTeam!), events);
      }

      if (card === state.activeTeam) {
        const remaining = newState.keycard!.filter(
          (c, i) => c === state.activeTeam && !newState.revealed![i],
        ).length;
        if (remaining === 0) {
          return buildWinResult(newState, state.activeTeam!, events);
        }
        // Also check if opponent somehow finished (shouldn't happen from own-team guess, but safe)
        const maxReached =
          newState.maxGuesses !== 'unlimited' && newState.guessesUsed >= newState.maxGuesses;
        if (maxReached) {
          events.push(logSystem('log.turnEnd', { messageParams: { team: state.activeTeam! } }));
          newState = endTurn(newState);
        }
        return { ok: true, state: newState, events };
      }

      // Bystander: end turn
      if (card === 'bystander') {
        events.push(logSystem('log.turnEnd', { messageParams: { team: state.activeTeam! } }));
        return { ok: true, state: endTurn(newState), events };
      }

      // Opponent's word: also check if opponent now wins
      const opponentTeam = card as Team;
      const opponentRemaining = newState.keycard!.filter(
        (c, i) => c === opponentTeam && !newState.revealed![i],
      ).length;
      if (opponentRemaining === 0) {
        return buildWinResult(newState, opponentTeam, events);
      }
      events.push(logSystem('log.turnEnd', { messageParams: { team: state.activeTeam! } }));
      return { ok: true, state: endTurn(newState), events };
    }

    // ---- endGuessing ----
    if (action.type === 'endGuessing') {
      if (state.phase !== 'guess') {
        return { ok: false, reason: 'Not in guess phase' };
      }
      const myAssign = state.assignments[playerID];
      if (!myAssign || myAssign.role !== 'operative' || myAssign.team !== state.activeTeam) {
        return { ok: false, reason: 'Only active team operatives can end guessing' };
      }
      const clueCount = state.currentClue?.count;
      const canEnd = state.guessesUsed >= 1 || clueCount === 0;
      if (!canEnd) {
        return { ok: false, reason: 'Must make at least one guess before ending' };
      }
      const events: EngineEvent[] = [
        logAction(playerID, 'log.endGuessing'),
        logSystem('log.turnEnd', { messageParams: { team: state.activeTeam! } }),
      ];
      return { ok: true, state: endTurn(state), events };
    }

    return { ok: false, reason: 'Unknown action' };
  },

  getPlayerView(state, playerID): PlayerView {
    const myAssign = state.assignments[playerID];
    const isSpymaster = myAssign?.role === 'spymaster';

    const board = state.words
      ? state.words.map((word, i) => ({
          word,
          revealed: state.revealed![i],
          color: isSpymaster || state.revealed![i] ? state.keycard![i] : null,
        }))
      : null;

    const playersInfo: PlayerTeamInfo[] = state.players.map((id) => ({
      id,
      team: state.assignments[id]?.team ?? null,
      role: state.assignments[id]?.role ?? null,
    }));

    return {
      phase: state.phase,
      board,
      activeTeam: state.activeTeam,
      firstTeam: state.firstTeam,
      currentClue: state.currentClue,
      guessesUsed: state.guessesUsed,
      maxGuesses: state.maxGuesses,
      redRemaining: countRemaining(state, 'red'),
      blueRemaining: countRemaining(state, 'blue'),
      myTeam: myAssign?.team ?? null,
      myRole: myAssign?.role ?? null,
      playersInfo,
      winner: state.winner,
    };
  },

  getSpectatorView(state): PlayerView {
    const board = state.words
      ? state.words.map((word, i) => ({
          word,
          revealed: state.revealed![i],
          color: state.revealed![i] ? state.keycard![i] : null,
        }))
      : null;

    const playersInfo: PlayerTeamInfo[] = state.players.map((id) => ({
      id,
      team: state.assignments[id]?.team ?? null,
      role: state.assignments[id]?.role ?? null,
    }));

    return {
      phase: state.phase,
      board,
      activeTeam: state.activeTeam,
      firstTeam: state.firstTeam,
      currentClue: state.currentClue,
      guessesUsed: state.guessesUsed,
      maxGuesses: state.maxGuesses,
      redRemaining: countRemaining(state, 'red'),
      blueRemaining: countRemaining(state, 'blue'),
      myTeam: null,
      myRole: null,
      playersInfo,
      winner: state.winner,
    };
  },
};
