import { GameTestHarness } from '@repo/shared/testing';
import { describe, expect, it } from 'vitest';
import { logic } from './logic';

function createGame(seed = 'test-seed') {
  const h = new GameTestHarness(logic, {
    players: ['Alice', 'Bob', 'Carol', 'Dave'],
    seed,
  });
  h.setup();
  return h;
}

/** Sets up teams: Alice=red-spy, Bob=red-op, Carol=blue-spy, Dave=blue-op, then commitTeams */
function setupTeams(h: ReturnType<typeof createGame>) {
  h.action('Alice', { type: 'joinTeam', team: 'red', role: 'spymaster' });
  h.action('Bob', { type: 'joinTeam', team: 'red', role: 'operative' });
  h.action('Carol', { type: 'joinTeam', team: 'blue', role: 'spymaster' });
  h.action('Dave', { type: 'joinTeam', team: 'blue', role: 'operative' });
  h.action('Alice', { type: 'commitTeams' });
}

describe('Codenames Logic', () => {
  describe('setup', () => {
    it('starts in setup phase with no board', () => {
      const h = createGame();
      const view = h.view('Alice');
      expect(view.phase).toBe('setup');
      expect(view.board).toBeNull();
      expect(view.myTeam).toBeNull();
    });

    it('after commitTeams produces 25 words', () => {
      const h = createGame();
      setupTeams(h);
      const view = h.view('Alice');
      expect(view.phase).toBe('clue');
      expect(view.board).toHaveLength(25);
    });

    it('keycard has correct 9/8/7/1 split', () => {
      const h = createGame();
      setupTeams(h);
      // Alice is red spymaster — sees all colors
      const board = h.view('Alice').board!;
      const counts = { red: 0, blue: 0, bystander: 0, assassin: 0 };
      for (const cell of board) {
        counts[cell.color as keyof typeof counts]++;
      }
      // One team has 9, other has 8
      const teams = [counts.red, counts.blue].sort((a, b) => a - b);
      expect(teams).toEqual([8, 9]);
      expect(counts.bystander).toBe(7);
      expect(counts.assassin).toBe(1);
    });
  });

  describe('joinTeam', () => {
    it('assigns player to team and role', () => {
      const h = createGame();
      h.action('Alice', { type: 'joinTeam', team: 'red', role: 'spymaster' });
      const info = h.view('Alice').playersInfo.find((p) => p.id === 'Alice');
      expect(info?.team).toBe('red');
      expect(info?.role).toBe('spymaster');
    });

    it('allows switching team and role freely', () => {
      const h = createGame();
      h.action('Alice', { type: 'joinTeam', team: 'red', role: 'spymaster' });
      h.action('Alice', { type: 'joinTeam', team: 'blue', role: 'operative' });
      const info = h.view('Alice').playersInfo.find((p) => p.id === 'Alice');
      expect(info?.team).toBe('blue');
      expect(info?.role).toBe('operative');
    });

    it('rejects duplicate spymaster on same team', () => {
      const h = createGame();
      h.action('Alice', { type: 'joinTeam', team: 'red', role: 'spymaster' });
      const result = h.action('Bob', { type: 'joinTeam', team: 'red', role: 'spymaster' });
      expect(result.ok).toBe(false);
    });

    it('allows spymaster if joining different team', () => {
      const h = createGame();
      h.action('Alice', { type: 'joinTeam', team: 'red', role: 'spymaster' });
      const result = h.action('Bob', { type: 'joinTeam', team: 'blue', role: 'spymaster' });
      expect(result.ok).toBe(true);
    });
  });

  describe('commitTeams', () => {
    it('rejects when teams are incomplete', () => {
      const h = createGame();
      h.action('Alice', { type: 'joinTeam', team: 'red', role: 'spymaster' });
      // Missing blue spymaster, blue operative, red operative
      const result = h.action('Alice', { type: 'commitTeams' });
      expect(result.ok).toBe(false);
    });

    it('succeeds when both teams are valid', () => {
      const h = createGame();
      setupTeams(h);
      expect(h.view('Alice').phase).toBe('clue');
    });

    it('rejects commitTeams during clue phase', () => {
      const h = createGame();
      setupTeams(h);
      const result = h.action('Alice', { type: 'commitTeams' });
      expect(result.ok).toBe(false);
    });
  });

  describe('giveClue', () => {
    it('allows spymaster to give a valid clue', () => {
      const h = createGame();
      setupTeams(h);
      const view = h.view('Alice');
      const activeSpymaster = view.firstTeam === 'red' ? 'Alice' : 'Carol';
      const result = h.action(activeSpymaster, { type: 'giveClue', word: 'ocean', count: 2 });
      expect(result.ok).toBe(true);
    });

    it('rejects clue when word matches a board word', () => {
      const h = createGame();
      setupTeams(h);
      const view = h.view('Alice');
      const activeSpymaster = view.firstTeam === 'red' ? 'Alice' : 'Carol';
      // Use the first board word as the clue — must be rejected
      const boardWord = view.board![0].word;
      const result = h.action(activeSpymaster, {
        type: 'giveClue',
        word: boardWord,
        count: 1,
      });
      expect(result.ok).toBe(false);
    });

    it('rejects clue from operative', () => {
      const h = createGame();
      setupTeams(h);
      const view = h.view('Alice');
      const activeOp = view.firstTeam === 'red' ? 'Bob' : 'Dave';
      const result = h.action(activeOp, { type: 'giveClue', word: 'ocean', count: 1 });
      expect(result.ok).toBe(false);
    });

    it('rejects clue from wrong team spymaster', () => {
      const h = createGame();
      setupTeams(h);
      const view = h.view('Alice');
      const inactiveSpymaster = view.firstTeam === 'red' ? 'Carol' : 'Alice';
      const result = h.action(inactiveSpymaster, { type: 'giveClue', word: 'ocean', count: 1 });
      expect(result.ok).toBe(false);
    });

    it('emits NOTIFY_ALL with log.clue on valid clue', () => {
      const h = createGame();
      setupTeams(h);
      const view = h.view('Alice');
      const activeSpymaster = view.firstTeam === 'red' ? 'Alice' : 'Carol';
      h.action(activeSpymaster, { type: 'giveClue', word: 'testclue', count: 2 });
      const notify = h.lastEvents.find((e) => e.type === 'NOTIFY_ALL');
      expect(notify).toBeDefined();
      expect((notify as any).payload).toMatchObject({
        channel: 'log',
        messageKey: 'log.clue',
        kind: 'action',
      });
    });
  });

  describe('guess', () => {
    function setupAndClue(wordOverride?: string) {
      const h = createGame();
      setupTeams(h);
      const view = h.view('Alice');
      const firstTeam = view.firstTeam!;
      const activeSpymaster = firstTeam === 'red' ? 'Alice' : 'Carol';
      const activeOp = firstTeam === 'red' ? 'Bob' : 'Dave';
      const clueWord = wordOverride ?? 'testclue';
      h.action(activeSpymaster, { type: 'giveClue', word: clueWord, count: 2 });
      return { h, firstTeam, activeSpymaster, activeOp };
    }

    it('allows operative to guess a cell', () => {
      const { h, activeOp } = setupAndClue();
      // Find a not-yet-revealed cell
      const result = h.action(activeOp, { type: 'guess', cellIndex: 0 });
      expect(result.ok).toBe(true);
    });

    it('rejects guessing an already-revealed cell', () => {
      const { h, activeOp } = setupAndClue();
      h.action(activeOp, { type: 'guess', cellIndex: 0 });
      const result = h.action(activeOp, { type: 'guess', cellIndex: 0 });
      expect(result.ok).toBe(false);
    });

    it('ends turn when bystander is revealed', () => {
      const { h, firstTeam, activeOp } = setupAndClue();
      // Find a bystander cell
      const board = h.view('Alice').board!;
      const bystander = board.findIndex((c) => c.color === 'bystander');
      h.action(activeOp, { type: 'guess', cellIndex: bystander });
      const newView = h.view('Alice');
      expect(newView.phase).toBe('clue');
      expect(newView.activeTeam).not.toBe(firstTeam);
    });

    it('ends turn when opponent word is revealed', () => {
      const { h, firstTeam, activeOp } = setupAndClue();
      const opponentTeam = firstTeam === 'red' ? 'blue' : 'red';
      const board = h.view('Alice').board!;
      const opponentCell = board.findIndex((c) => c.color === opponentTeam);
      h.action(activeOp, { type: 'guess', cellIndex: opponentCell });
      const newView = h.view('Alice');
      expect(newView.phase).toBe('clue');
      expect(newView.activeTeam).not.toBe(firstTeam);
    });

    it('ends game when assassin is revealed', () => {
      const { h, firstTeam, activeOp } = setupAndClue();
      const board = h.view('Alice').board!;
      const assassinIdx = board.findIndex((c) => c.color === 'assassin');
      h.action(activeOp, { type: 'guess', cellIndex: assassinIdx });
      const newView = h.view('Alice');
      expect(newView.phase).toBe('over');
      const opponentTeam = firstTeam === 'red' ? 'blue' : 'red';
      expect(newView.winner).toBe(opponentTeam);
      expect(h.isFinished).toBe(true);
    });

    it('wins when all own team words are revealed', () => {
      const { h, firstTeam, activeSpymaster, activeOp } = setupAndClue();
      const board = h.view('Alice').board!;
      const ownCells = board
        .map((c, i) => ({ ...c, i }))
        .filter((c) => c.color === firstTeam)
        .map((c) => c.i);
      // Reveal all but last via unlimited clue to avoid turn end from max guesses
      h.action(activeSpymaster, { type: 'giveClue', word: 'special', count: 'unlimited' });
      // Note: after the giveClue above the previous clue state is done - but we needed to
      // give a clue first. Let's just iterate with endGuessing trick or give unlimited clue
      // at the start. Re-setup properly:
      const h2 = createGame('win-test');
      setupTeams(h2);
      const view2 = h2.view('Alice');
      const ft2 = view2.firstTeam!;
      const spy2 = ft2 === 'red' ? 'Alice' : 'Carol';
      const op2 = ft2 === 'red' ? 'Bob' : 'Dave';
      h2.action(spy2, { type: 'giveClue', word: 'victory', count: 'unlimited' });
      const board2 = h2.view('Alice').board!;
      const ownCells2 = board2
        .map((c, i) => ({ ...c, i }))
        .filter((c) => c.color === ft2)
        .map((c) => c.i);
      for (const idx of ownCells2) {
        const r = h2.action(op2, { type: 'guess', cellIndex: idx });
        if (!r.ok) continue;
        if (h2.isFinished) break;
      }
      expect(h2.isFinished).toBe(true);
      expect(h2.view('Alice').winner).toBe(ft2);
    });
  });

  describe('endGuessing', () => {
    it('allows endGuessing after at least 1 guess', () => {
      const h = createGame();
      setupTeams(h);
      const view = h.view('Alice');
      const ft = view.firstTeam!;
      const spy = ft === 'red' ? 'Alice' : 'Carol';
      const op = ft === 'red' ? 'Bob' : 'Dave';
      h.action(spy, { type: 'giveClue', word: 'testclue', count: 3 });
      h.action(op, { type: 'guess', cellIndex: 0 });
      const result = h.action(op, { type: 'endGuessing' });
      expect(result.ok).toBe(true);
      expect(h.view('Alice').activeTeam).not.toBe(ft);
    });

    it('rejects endGuessing before any guess (non-zero count)', () => {
      const h = createGame();
      setupTeams(h);
      const view = h.view('Alice');
      const ft = view.firstTeam!;
      const spy = ft === 'red' ? 'Alice' : 'Carol';
      const op = ft === 'red' ? 'Bob' : 'Dave';
      h.action(spy, { type: 'giveClue', word: 'testclue', count: 3 });
      const result = h.action(op, { type: 'endGuessing' });
      expect(result.ok).toBe(false);
    });

    it('allows endGuessing immediately when count is 0', () => {
      const h = createGame();
      setupTeams(h);
      const view = h.view('Alice');
      const ft = view.firstTeam!;
      const spy = ft === 'red' ? 'Alice' : 'Carol';
      const op = ft === 'red' ? 'Bob' : 'Dave';
      h.action(spy, { type: 'giveClue', word: 'testclue', count: 0 });
      const result = h.action(op, { type: 'endGuessing' });
      expect(result.ok).toBe(true);
    });
  });

  describe('hidden information', () => {
    it('operatives cannot see keycard colors for unrevealed cells', () => {
      const h = createGame();
      setupTeams(h);
      const board = h.view('Bob').board!; // Bob is red operative
      const unrevealed = board.filter((c) => !c.revealed);
      expect(unrevealed.every((c) => c.color === null)).toBe(true);
    });

    it('spymasters see all keycard colors', () => {
      const h = createGame();
      setupTeams(h);
      const board = h.view('Alice').board!; // Alice is red spymaster
      expect(board.every((c) => c.color !== null)).toBe(true);
    });

    it('spymaster and operative views differ on unrevealed cells', () => {
      const h = createGame();
      setupTeams(h);
      h.expectViewsDiffer('board', 'Alice', 'Bob');
    });
  });

  describe('activity log', () => {
    it('emits NOTIFY_ALL with log.clue channel and key', () => {
      const h = createGame();
      setupTeams(h);
      const view = h.view('Alice');
      const spy = view.firstTeam === 'red' ? 'Alice' : 'Carol';
      h.action(spy, { type: 'giveClue', word: 'waterfall', count: 1 });
      const notify = h.lastEvents.find((e) => e.type === 'NOTIFY_ALL');
      expect(notify).toBeDefined();
      expect((notify as any).payload).toMatchObject({
        channel: 'log',
        messageKey: 'log.clue',
      });
    });
  });
});
