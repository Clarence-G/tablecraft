import { GameTestHarness } from '@repo/shared/testing';
import { describe, expect, it } from 'vitest';
import { logic } from './logic';

// Helper to create a game with N players
function createGame(playerIds: string[], seed = 'test-seed') {
  const h = new GameTestHarness(logic, { players: playerIds, seed });
  h.setup();
  return h;
}

// Helper: get the speaker order for describe phase
function getSpeakers(h: GameTestHarness<any, any, any>, playerIds: string[]): string[] {
  // Find who is the current speaker by checking views
  const aliveIds = playerIds.filter((id) => h.view(id).myAlive);
  const first = aliveIds.find((id) => h.view(id).currentSpeaker === id);
  return first ? [first] : [];
}

describe('Undercover Logic', () => {
  describe('setup', () => {
    it('assigns 1 undercover for 3 players', () => {
      const h = createGame(['A', 'B', 'C']);
      const roles = ['A', 'B', 'C'].map((id) => h.view(id).myRole);
      const undercoverCount = roles.filter((r) => r === 'undercover').length;
      expect(undercoverCount).toBe(1);
    });

    it('assigns 1 undercover for 5 players', () => {
      const h = createGame(['A', 'B', 'C', 'D', 'E']);
      const roles = ['A', 'B', 'C', 'D', 'E'].map((id) => h.view(id).myRole);
      const undercoverCount = roles.filter((r) => r === 'undercover').length;
      expect(undercoverCount).toBe(1);
    });

    it('assigns 2 undercovers for 8 players', () => {
      const h = createGame(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);
      const roles = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map((id) => h.view(id).myRole);
      const undercoverCount = roles.filter((r) => r === 'undercover').length;
      expect(undercoverCount).toBe(2);
    });

    it('each player can only see their own word (private info)', () => {
      const h = createGame(['A', 'B', 'C']);
      const wordA = h.view('A').myWord;
      const wordB = h.view('B').myWord;
      const wordC = h.view('C').myWord;
      // Two civilians share the same word; undercover has a different word
      // We don't know the arrangement, but at least one pair should differ
      const words = [wordA, wordB, wordC];
      const uniqueWords = new Set(words);
      // There must be exactly 2 distinct words (civilian word and undercover word)
      expect(uniqueWords.size).toBe(2);
    });

    it('players with different roles see different words', () => {
      const h = createGame(['A', 'B', 'C']);
      const undercoverId = ['A', 'B', 'C'].find((id) => h.view(id).myRole === 'undercover')!;
      const civilianId = ['A', 'B', 'C'].find((id) => h.view(id).myRole === 'civilian')!;
      expect(h.view(undercoverId).myWord).not.toBe(h.view(civilianId).myWord);
    });

    it('starts in describe phase', () => {
      const h = createGame(['A', 'B', 'C']);
      expect(h.view('A').phase).toBe('describe');
      expect(h.view('A').round).toBe(1);
    });
  });

  describe('describe phase', () => {
    it('rejects describe out of turn', () => {
      const h = createGame(['A', 'B', 'C']);
      // currentSpeaker is the first speaker; find who is NOT the speaker
      const speakerId = h.view('A').currentSpeaker ?? h.view('B').currentSpeaker ?? h.view('C').currentSpeaker;
      const nonSpeaker = ['A', 'B', 'C'].find((id) => id !== speakerId)!;
      const result = h.action(nonSpeaker, { type: 'describe', text: 'something' });
      expect(result.ok).toBe(false);
    });

    it('accepts describe when it is your turn', () => {
      const h = createGame(['A', 'B', 'C']);
      const speakerId = ['A', 'B', 'C'].find((id) => h.view(id).currentSpeaker === id)!;
      const result = h.action(speakerId, { type: 'describe', text: 'a clue' });
      expect(result.ok).toBe(true);
    });

    it('transitions to vote phase when all alive players have described', () => {
      const h = createGame(['A', 'B', 'C']);
      // Each player describes in seat order
      for (let i = 0; i < 3; i++) {
        const speakerId = ['A', 'B', 'C'].find((id) => h.view(id).currentSpeaker === id)!;
        h.action(speakerId, { type: 'describe', text: `clue ${i}` });
      }
      expect(h.view('A').phase).toBe('vote');
    });
  });

  describe('vote phase', () => {
    function advanceToVote(playerIds: string[]) {
      const h = createGame(playerIds);
      for (let i = 0; i < playerIds.length; i++) {
        const speakerId = playerIds.find((id) => h.view(id).currentSpeaker === id)!;
        h.action(speakerId, { type: 'describe', text: `clue ${i}` });
      }
      return h;
    }

    it('rejects vote for self', () => {
      const h = advanceToVote(['A', 'B', 'C']);
      const result = h.action('A', { type: 'vote', targetId: 'A' });
      expect(result.ok).toBe(false);
    });

    it('rejects vote for eliminated player', () => {
      // 4-player game so we can eliminate 1 and still have 3 left
      const h = advanceToVote(['A', 'B', 'C', 'D']);
      // Everyone votes for A to eliminate them
      h.action('B', { type: 'vote', targetId: 'A' });
      h.action('C', { type: 'vote', targetId: 'A' });
      h.action('D', { type: 'vote', targetId: 'A' });
      h.action('A', { type: 'vote', targetId: 'B' });
      // A should be eliminated now; try voting for A in next round if applicable
      // Since elimination may trigger win, just verify the reject logic
      if (h.view('B').phase === 'describe') {
        // A was eliminated successfully; move to next vote
        for (let i = 0; i < 3; i++) {
          const speakerId = ['B', 'C', 'D'].find((id) => h.view(id).myAlive && h.view(id).currentSpeaker === id);
          if (speakerId) h.action(speakerId, { type: 'describe', text: `clue ${i}` });
        }
        const result = h.action('B', { type: 'vote', targetId: 'A' });
        expect(result.ok).toBe(false);
      }
    });

    it('accepts valid vote and tracks it', () => {
      const h = advanceToVote(['A', 'B', 'C']);
      const result = h.action('A', { type: 'vote', targetId: 'B' });
      expect(result.ok).toBe(true);
    });
  });

  describe('win conditions', () => {
    it('civilians win when the only undercover is eliminated', () => {
      const h = createGame(['A', 'B', 'C']);
      // Find the undercover
      const undercoverId = ['A', 'B', 'C'].find((id) => h.view(id).myRole === 'undercover')!;
      const civilians = ['A', 'B', 'C'].filter((id) => id !== undercoverId);

      // Describe round
      for (let i = 0; i < 3; i++) {
        const speakerId = ['A', 'B', 'C'].find((id) => h.view(id).currentSpeaker === id)!;
        h.action(speakerId, { type: 'describe', text: `clue` });
      }

      // All civilians vote for undercover; undercover votes for anyone else
      for (const civ of civilians) {
        h.action(civ, { type: 'vote', targetId: undercoverId });
      }
      h.action(undercoverId, { type: 'vote', targetId: civilians[0] });

      expect(h.isFinished).toBe(true);
      expect(h.view('A').winner).toBe('civilian');
    });

    it('undercovers win when undercover count >= civilian count (3p game, 2 civilians left after eliminating 1 civ)', () => {
      // In a 4-player game: 1 undercover, 3 civilians. Eliminate 2 civilians → 1 undercover vs 1 civilian → undercover wins
      const players = ['A', 'B', 'C', 'D'];
      const h = createGame(players);
      const undercoverId = players.find((id) => h.view(id).myRole === 'undercover')!;
      const civilians = players.filter((id) => id !== undercoverId);

      function runRound(targeted: string) {
        const alive = players.filter((id) => h.view(id).myAlive);
        for (let i = 0; i < alive.length; i++) {
          const speakerId = alive.find((id) => h.view(id).currentSpeaker === id)!;
          h.action(speakerId, { type: 'describe', text: 'clue' });
        }
        const aliveNow = players.filter((id) => h.view(id).myAlive);
        for (const pid of aliveNow) {
          if (pid !== targeted) h.action(pid, { type: 'vote', targetId: targeted });
          else h.action(pid, { type: 'vote', targetId: aliveNow.find((x) => x !== pid)! });
        }
      }

      // Eliminate 2 civilians
      runRound(civilians[0]);
      if (!h.isFinished) runRound(civilians[1]);

      expect(h.isFinished).toBe(true);
      expect(h.view(undercoverId).winner).toBe('undercover');
    });
  });

  describe('tie handling', () => {
    it('triggers re-describe when votes are tied', () => {
      // 4 players: 2 civilians vote for undercover, 1 civilian + undercover vote for a civilian — tie between 2
      const h = createGame(['A', 'B', 'C', 'D']);
      const undercoverId = ['A', 'B', 'C', 'D'].find((id) => h.view(id).myRole === 'undercover')!;
      const civilians = ['A', 'B', 'C', 'D'].filter((id) => id !== undercoverId);

      // Describe round
      for (let i = 0; i < 4; i++) {
        const speakerId = ['A', 'B', 'C', 'D'].find((id) => h.view(id).currentSpeaker === id)!;
        h.action(speakerId, { type: 'describe', text: 'clue' });
      }

      // Create a 2-way tie: 2 people vote for civilians[0], 2 vote for undercoverId
      h.action(civilians[0], { type: 'vote', targetId: undercoverId });
      h.action(civilians[1], { type: 'vote', targetId: undercoverId });
      h.action(undercoverId, { type: 'vote', targetId: civilians[0] });
      h.action(civilians[2], { type: 'vote', targetId: civilians[0] });

      // Should trigger tie re-describe
      const view = h.view(civilians[0]);
      expect(view.phase).toBe('describe');
      expect(view.tiePlayerIds.length).toBeGreaterThan(0);
    });
  });

  describe('activity log notifications', () => {
    it('emits NOTIFY_ALL with log.eliminated and channel: log when a player is eliminated', () => {
      const h = createGame(['A', 'B', 'C']);
      const undercoverId = ['A', 'B', 'C'].find((id) => h.view(id).myRole === 'undercover')!;
      const civilians = ['A', 'B', 'C'].filter((id) => id !== undercoverId);

      for (let i = 0; i < 3; i++) {
        const speakerId = ['A', 'B', 'C'].find((id) => h.view(id).currentSpeaker === id)!;
        h.action(speakerId, { type: 'describe', text: 'clue' });
      }
      for (const civ of civilians) h.action(civ, { type: 'vote', targetId: undercoverId });
      h.action(undercoverId, { type: 'vote', targetId: civilians[0] });

      const eliminatedNotify = h.lastEvents.find(
        (e) => e.type === 'NOTIFY_ALL' && (e as any).payload?.messageKey === 'log.eliminated',
      );
      expect(eliminatedNotify).toBeDefined();
      expect((eliminatedNotify as any).payload).toMatchObject({
        channel: 'log',
        messageKey: 'log.eliminated',
        kind: 'system',
      });
    });

    it('emits NOTIFY_ALL with log.roundStart on new round', () => {
      // After elimination that doesn't end the game, a new round starts
      const h = createGame(['A', 'B', 'C', 'D']);
      const undercoverId = ['A', 'B', 'C', 'D'].find((id) => h.view(id).myRole === 'undercover')!;
      const civilians = ['A', 'B', 'C', 'D'].filter((id) => id !== undercoverId);

      for (let i = 0; i < 4; i++) {
        const speakerId = ['A', 'B', 'C', 'D'].find((id) => h.view(id).currentSpeaker === id)!;
        h.action(speakerId, { type: 'describe', text: 'clue' });
      }
      // Eliminate a civilian (not the undercover) so game continues
      for (const pid of ['A', 'B', 'C', 'D']) {
        if (pid !== civilians[0]) h.action(pid, { type: 'vote', targetId: civilians[0] });
        else h.action(pid, { type: 'vote', targetId: civilians[1] });
      }

      if (!h.isFinished) {
        const roundStartNotify = h.lastEvents.find(
          (e) => e.type === 'NOTIFY_ALL' && (e as any).payload?.messageKey === 'log.roundStart',
        );
        expect(roundStartNotify).toBeDefined();
        expect((roundStartNotify as any).payload).toMatchObject({
          channel: 'log',
          messageKey: 'log.roundStart',
        });
      }
    });
  });
});
