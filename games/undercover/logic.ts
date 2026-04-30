import type { ActionResult, EngineEvent, GameContext, GameLogic } from '@repo/shared';
import { logAction, logSystem } from '@repo/shared';
import { type Action, ActionSchema, type DescriptionEntry, type PlayerView, type VoteEntry } from './shared';
import enPairs from './i18n/en/pairs.json';
import zhPairs from './i18n/zh/pairs.json';

// ---- Internal State ----

type Role = 'civilian' | 'undercover';

interface PlayerState {
  id: string;
  role: Role;
  word: string;
  alive: boolean;
  /** Has described in the current sub-round */
  hasDescribed: boolean;
  /** Has voted in the current vote phase */
  hasVoted: boolean;
}

interface UndercoverState {
  players: PlayerState[];
  /** Seat order (stable across the whole game) */
  seatOrder: string[];
  phase: 'describe' | 'vote' | 'finished';
  round: number;
  /** Index into seatOrder for the current speaker (describe phase only) */
  currentSpeakerIdx: number;
  descriptions: DescriptionEntry[];
  votes: VoteEntry[];
  /**
   * Non-empty when we're in a tie-breaking re-describe.
   * Only these players need to describe before the next vote.
   */
  tiePlayerIds: string[];
  winner: 'civilian' | 'undercover' | null;
  rankings: string[];
}

// ---- Helpers ----

function undercoverCount(playerCount: number): number {
  return playerCount >= 8 ? 2 : 1;
}

function alivePlayers(state: UndercoverState): PlayerState[] {
  return state.players.filter((p) => p.alive);
}

function alivePlayerIds(state: UndercoverState): string[] {
  return alivePlayers(state).map((p) => p.id);
}

function getPlayer(state: UndercoverState, id: string): PlayerState {
  const p = state.players.find((pl) => pl.id === id);
  if (!p) throw new Error(`Player not found: ${id}`);
  return p;
}

/** Returns the first alive player in seat order at or after `startIdx` */
function nextAliveSpeakerIdx(state: UndercoverState, startIdx: number): number {
  const n = state.seatOrder.length;
  for (let i = 0; i < n; i++) {
    const idx = (startIdx + i) % n;
    const pid = state.seatOrder[idx];
    if (state.players.find((p) => p.id === pid)?.alive) return idx;
  }
  return startIdx;
}

function checkWin(state: UndercoverState): 'civilian' | 'undercover' | null {
  const alive = alivePlayers(state);
  const aliveUndercovers = alive.filter((p) => p.role === 'undercover').length;
  const aliveCivilians = alive.filter((p) => p.role === 'civilian').length;
  if (aliveUndercovers === 0) return 'civilian';
  if (aliveUndercovers >= aliveCivilians) return 'undercover';
  return null;
}

function buildRankings(state: UndercoverState, winner: 'civilian' | 'undercover'): string[] {
  const alive = alivePlayers(state).map((p) => p.id);
  const dead = state.players.filter((p) => !p.alive).map((p) => p.id);
  if (winner === 'civilian') {
    // Civilians first, then undercovers (eliminated order irrelevant for summarized view)
    const aliveCivilians = alivePlayers(state).filter((p) => p.role === 'civilian').map((p) => p.id);
    const aliveUndercovers = alivePlayers(state).filter((p) => p.role === 'undercover').map((p) => p.id);
    return [...aliveCivilians, ...aliveUndercovers, ...dead];
  }
  // Undercovers win: undercovers first
  const aliveUndercovers = alivePlayers(state).filter((p) => p.role === 'undercover').map((p) => p.id);
  const aliveCivilians = alivePlayers(state).filter((p) => p.role === 'civilian').map((p) => p.id);
  return [...aliveUndercovers, ...aliveCivilians, ...dead];
}

/** Determine who to speak next given a tie re-describe or a fresh round */
function firstSpeakerForDescribe(state: UndercoverState): number {
  if (state.tiePlayerIds.length > 0) {
    // Start from the first alive tied player in seat order
    const idx = state.seatOrder.findIndex((id) => state.tiePlayerIds.includes(id) && getPlayer(state, id).alive);
    return idx >= 0 ? idx : nextAliveSpeakerIdx(state, 0);
  }
  return nextAliveSpeakerIdx(state, 0);
}

/** Whether playerID needs to describe in the current sub-round */
function needsToDescribe(state: UndercoverState, pid: string): boolean {
  if (!getPlayer(state, pid).alive) return false;
  if (getPlayer(state, pid).hasDescribed) return false;
  if (state.tiePlayerIds.length > 0) return state.tiePlayerIds.includes(pid);
  return true;
}

// ---- Logic ----

export const logic: GameLogic<UndercoverState, Action, PlayerView> = {
  actions: ActionSchema,

  setup(ctx: GameContext): UndercoverState {
    const { players, random } = ctx;

    // Pick word pair deterministically using the seeded random
    const lang = 'zh'; // default to zh; pairs are identical in structure
    const pairs = lang === 'zh' ? zhPairs : enPairs;
    const pairIdx = random.int(0, pairs.length - 1);
    const pair = pairs[pairIdx];
    const civilianWord = pair.civilian;
    const undercoverWord = pair.undercover;

    // Shuffle seats
    const shuffled = random.shuffle([...players]);

    // Assign roles
    const numUndercovers = undercoverCount(players.length);
    const playerStates: PlayerState[] = shuffled.map((id, idx) => ({
      id,
      role: idx < numUndercovers ? 'undercover' : 'civilian',
      word: idx < numUndercovers ? undercoverWord : civilianWord,
      alive: true,
      hasDescribed: false,
      hasVoted: false,
    }));

    const seatOrder = shuffled;
    const firstIdx = nextAliveSpeakerIdx({ players: playerStates, seatOrder } as UndercoverState, 0);

    return {
      players: playerStates,
      seatOrder,
      phase: 'describe',
      round: 1,
      currentSpeakerIdx: firstIdx,
      descriptions: [],
      votes: [],
      tiePlayerIds: [],
      winner: null,
      rankings: [],
    };
  },

  onAction(state, action, playerID, ctx): ActionResult<UndercoverState> {
    if (state.phase === 'finished') {
      return { ok: false, reason: 'Game already over' };
    }

    const me = getPlayer(state, playerID);
    if (!me.alive) {
      return { ok: false, reason: 'You are eliminated' };
    }

    // ---- DESCRIBE ----
    if (action.type === 'describe') {
      if (state.phase !== 'describe') {
        return { ok: false, reason: 'Not in describe phase' };
      }
      const currentSpeaker = state.seatOrder[state.currentSpeakerIdx];
      if (playerID !== currentSpeaker) {
        return { ok: false, reason: 'Not your turn to describe' };
      }
      if (me.hasDescribed) {
        return { ok: false, reason: 'Already described this round' };
      }

      const newDescriptions: DescriptionEntry[] = [
        ...state.descriptions,
        { playerId: playerID, text: action.text },
      ];

      // Mark player as having described
      const newPlayers = state.players.map((p) =>
        p.id === playerID ? { ...p, hasDescribed: true } : p,
      );
      let newState: UndercoverState = { ...state, players: newPlayers, descriptions: newDescriptions };

      const events: EngineEvent[] = [
        logAction(playerID, 'log.describe', { round: state.round, text: action.text }),
      ];

      // Find next player who needs to describe
      const currentIdx = state.currentSpeakerIdx;
      const n = state.seatOrder.length;
      let nextIdx: number | null = null;
      for (let i = 1; i <= n; i++) {
        const candidateIdx = (currentIdx + i) % n;
        const candidateId = state.seatOrder[candidateIdx];
        const candidate = newPlayers.find((p) => p.id === candidateId)!;
        if (candidate.alive && !candidate.hasDescribed && needsToDescribeAfterUpdate(newState, candidateId)) {
          nextIdx = candidateIdx;
          break;
        }
      }

      if (nextIdx !== null) {
        // More players to describe
        newState = { ...newState, currentSpeakerIdx: nextIdx };
        return { ok: true, state: newState, events };
      }

      // All required players have described — transition to vote
      const resetPlayers = newState.players.map((p) => ({ ...p, hasVoted: false }));
      newState = { ...newState, players: resetPlayers, phase: 'vote', votes: [] };
      return { ok: true, state: newState, events };
    }

    // ---- VOTE ----
    if (action.type === 'vote') {
      if (state.phase !== 'vote') {
        return { ok: false, reason: 'Not in vote phase' };
      }
      if (me.hasVoted) {
        return { ok: false, reason: 'Already voted' };
      }
      if (action.targetId === playerID) {
        return { ok: false, reason: 'Cannot vote for yourself' };
      }
      const target = getPlayer(state, action.targetId);
      if (!target.alive) {
        return { ok: false, reason: 'Target is eliminated' };
      }

      const newVotes: VoteEntry[] = [...state.votes, { voterId: playerID, targetId: action.targetId }];
      const newPlayers = state.players.map((p) =>
        p.id === playerID ? { ...p, hasVoted: true } : p,
      );
      let newState: UndercoverState = { ...state, players: newPlayers, votes: newVotes };

      const events: EngineEvent[] = [
        logAction(playerID, 'log.voteSubmitted'),
      ];

      // Check if all alive players have voted
      const alive = alivePlayers(newState);
      const allVoted = alive.every((p) => p.hasVoted);

      if (!allVoted) {
        return { ok: true, state: newState, events };
      }

      // ---- Tally votes ----
      const voteCounts: Record<string, number> = {};
      for (const v of newVotes) {
        voteCounts[v.targetId] = (voteCounts[v.targetId] ?? 0) + 1;
      }
      const maxVotes = Math.max(...Object.values(voteCounts));
      const topTargets = Object.entries(voteCounts)
        .filter(([, count]) => count === maxVotes)
        .map(([id]) => id);

      if (topTargets.length === 1) {
        // Unique highest → eliminate
        const eliminatedId = topTargets[0];
        const eliminatedRole = getPlayer(newState, eliminatedId).role;
        newState = {
          ...newState,
          players: newState.players.map((p) =>
            p.id === eliminatedId ? { ...p, alive: false, role: p.role } : p,
          ),
        };

        events.push(
          logSystem('log.eliminated', { messageParams: { targetId: eliminatedId, role: eliminatedRole } }),
        );

        // Check win condition
        const winResult = checkWin(newState);
        if (winResult) {
          const rankings = buildRankings(newState, winResult);
          newState = { ...newState, phase: 'finished', winner: winResult, rankings };
          const winKey = winResult === 'civilian' ? 'log.civilianWins' : 'log.undercoverWins';
          events.push(logSystem(winKey));
          events.push({ type: 'END_GAME', rankings });
          return { ok: true, state: newState, events };
        }

        // Start new describe round
        const nextRound = state.round + 1;
        const resetPS = newState.players.map((p) => ({ ...p, hasDescribed: false, hasVoted: false }));
        newState = {
          ...newState,
          players: resetPS,
          phase: 'describe',
          round: nextRound,
          descriptions: [],
          votes: [],
          tiePlayerIds: [],
          currentSpeakerIdx: nextAliveSpeakerIdx(newState, 0),
        };
        events.push(logSystem('log.roundStart', { messageParams: { round: nextRound } }));
        return { ok: true, state: newState, events };
      }

      // ---- Tie ----
      // Top tied players re-describe; if STILL tied → random elimination via seed
      if (state.tiePlayerIds.length > 0) {
        // Second tie — random elimination from current top targets
        const randomIdx = ctx.random.int(0, topTargets.length - 1);
        const eliminatedId = topTargets[randomIdx];
        const eliminatedRole = getPlayer(newState, eliminatedId).role;
        newState = {
          ...newState,
          players: newState.players.map((p) =>
            p.id === eliminatedId ? { ...p, alive: false } : p,
          ),
        };

        events.push(logSystem('log.tieEliminated'));
        events.push(logSystem('log.eliminated', { messageParams: { targetId: eliminatedId, role: eliminatedRole } }));

        const winResult = checkWin(newState);
        if (winResult) {
          const rankings = buildRankings(newState, winResult);
          newState = { ...newState, phase: 'finished', winner: winResult, rankings };
          const winKey = winResult === 'civilian' ? 'log.civilianWins' : 'log.undercoverWins';
          events.push(logSystem(winKey));
          events.push({ type: 'END_GAME', rankings });
          return { ok: true, state: newState, events };
        }

        // New round
        const nextRound = state.round + 1;
        const resetPS = newState.players.map((p) => ({ ...p, hasDescribed: false, hasVoted: false }));
        newState = {
          ...newState,
          players: resetPS,
          phase: 'describe',
          round: nextRound,
          descriptions: [],
          votes: [],
          tiePlayerIds: [],
          currentSpeakerIdx: nextAliveSpeakerIdx(newState, 0),
        };
        events.push(logSystem('log.roundStart', { messageParams: { round: nextRound } }));
        return { ok: true, state: newState, events };
      }

      // First tie — trigger re-describe for tied players only
      const resetPS = newState.players.map((p) => ({
        ...p,
        hasDescribed: false,
        hasVoted: false,
      }));
      const firstTieIdx = state.seatOrder.findIndex(
        (id) => topTargets.includes(id) && getPlayer(newState, id).alive,
      );
      newState = {
        ...newState,
        players: resetPS,
        phase: 'describe',
        descriptions: [],
        votes: [],
        tiePlayerIds: topTargets,
        currentSpeakerIdx: firstTieIdx >= 0 ? firstTieIdx : 0,
      };
      events.push(logSystem('log.tieReDescribe', { messageParams: { tieCount: topTargets.length } }));
      return { ok: true, state: newState, events };
    }

    return { ok: false, reason: 'Unknown action' };
  },

  getPlayerView(state, playerID): PlayerView {
    const me = getPlayer(state, playerID);
    const currentSpeaker =
      state.phase === 'describe' ? state.seatOrder[state.currentSpeakerIdx] ?? null : null;

    const players = state.players.map((p) => ({
      id: p.id,
      alive: p.alive,
      // Reveal role only when eliminated or game finished
      role: (!p.alive || state.phase === 'finished') ? p.role : null,
      hasDescribed: p.hasDescribed,
      hasVoted: p.hasVoted,
    }));

    // In vote phase, reveal votes after tally (all voted) or during game over
    const revealVotes = state.phase === 'vote'
      ? alivePlayers(state).every((p) => p.hasVoted)
      : state.phase === 'finished';

    return {
      phase: state.phase,
      round: state.round,
      myWord: me.word,
      myRole: me.role,
      myAlive: me.alive,
      currentSpeaker,
      descriptions: state.descriptions,
      players,
      votes: revealVotes ? state.votes : [],
      tiePlayerIds: state.tiePlayerIds,
      winner: state.winner,
      rankings: state.rankings,
    };
  },

  getSpectatorView(state): PlayerView {
    const currentSpeaker =
      state.phase === 'describe' ? state.seatOrder[state.currentSpeakerIdx] ?? null : null;

    const players = state.players.map((p) => ({
      id: p.id,
      alive: p.alive,
      role: (!p.alive || state.phase === 'finished') ? p.role : null,
      hasDescribed: p.hasDescribed,
      hasVoted: p.hasVoted,
    }));

    const revealVotes = state.phase === 'finished';

    return {
      phase: state.phase,
      round: state.round,
      myWord: '',
      myRole: null,
      myAlive: false,
      currentSpeaker,
      descriptions: state.descriptions,
      players,
      votes: revealVotes ? state.votes : [],
      tiePlayerIds: state.tiePlayerIds,
      winner: state.winner,
      rankings: state.rankings,
    };
  },
};

// ---- Private helper used within onAction (after players array updated) ----

function needsToDescribeAfterUpdate(state: UndercoverState, pid: string): boolean {
  const p = state.players.find((pl) => pl.id === pid);
  if (!p || !p.alive || p.hasDescribed) return false;
  if (state.tiePlayerIds.length > 0) return state.tiePlayerIds.includes(pid);
  return true;
}
