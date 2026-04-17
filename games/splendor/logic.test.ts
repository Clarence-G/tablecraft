import { GameTestHarness } from '@repo/shared/testing';
import { describe, expect, it } from 'vitest';
import { logic } from './logic';
import {
  ALL_CARDS,
  ALL_NOBLES,
  type Card,
  GEMS,
  type Noble,
  type PlayerView,
  VISIBLE_PER_LEVEL,
  WIN_POINTS,
} from './shared';

type H = GameTestHarness<any, any, PlayerView>;

function createGame(players = ['Alice', 'Bob'], seed = 'splendor-seed') {
  const h = new GameTestHarness(logic, { players, seed });
  h.setup();
  return h;
}

describe('Splendor Setup', () => {
  it('creates correct supply for 2 players', () => {
    const h = createGame();
    const v = h.view('Alice');
    for (const g of GEMS) expect(v.supply[g]).toBe(4);
    expect(v.supply.gold).toBe(5);
  });

  it('creates correct supply for 4 players', () => {
    const h = createGame(['A', 'B', 'C', 'D']);
    const v = h.view('A');
    for (const g of GEMS) expect(v.supply[g]).toBe(7);
    expect(v.supply.gold).toBe(5);
  });

  it('deals 4 visible cards per level', () => {
    const h = createGame();
    const v = h.view('Alice');
    for (const lvl of [1, 2, 3] as const) {
      expect(v.visible[lvl].filter((c) => c !== null)).toHaveLength(VISIBLE_PER_LEVEL);
    }
  });

  it('deals (players+1) nobles', () => {
    const h2 = createGame(['A', 'B']);
    const h4 = createGame(['A', 'B', 'C', 'D']);
    expect(h2.view('A').nobles).toHaveLength(3);
    expect(h4.view('A').nobles).toHaveLength(5);
  });

  it('first player plays first', () => {
    const h = createGame();
    expect(h.view('Alice').currentPlayer).toBe('Alice');
  });

  it('starts with empty player gems and bonuses', () => {
    const h = createGame();
    const p = h.view('Alice').players[0];
    for (const g of GEMS) {
      expect(p.gems[g]).toBe(0);
      expect(p.bonuses[g]).toBe(0);
    }
    expect(p.gems.gold).toBe(0);
    expect(p.points).toBe(0);
    expect(p.reservedCount).toBe(0);
  });

  it('has exactly 90 cards across 3 levels', () => {
    expect(ALL_CARDS.filter((c) => c.level === 1)).toHaveLength(40);
    expect(ALL_CARDS.filter((c) => c.level === 2)).toHaveLength(30);
    expect(ALL_CARDS.filter((c) => c.level === 3)).toHaveLength(20);
    expect(ALL_NOBLES).toHaveLength(10);
  });
});

describe('Take Three', () => {
  it('takes 3 different colors', () => {
    const h = createGame();
    const res = h.action('Alice', {
      type: 'take_three',
      colors: ['white', 'blue', 'green'],
    });
    expect(res.ok).toBe(true);
    const v = h.view('Alice');
    const me = v.players.find((p) => p.id === 'Alice');
    expect(me!.gems.white).toBe(1);
    expect(me!.gems.blue).toBe(1);
    expect(me!.gems.green).toBe(1);
    expect(v.supply.white).toBe(3);
    expect(v.currentPlayer).toBe('Bob');
  });

  it('rejects duplicate colors', () => {
    const h = createGame();
    const res = h.action('Alice', {
      type: 'take_three',
      colors: ['white', 'white', 'blue'],
    });
    expect(res.ok).toBe(false);
  });

  it('rejects when not your turn', () => {
    const h = createGame();
    const res = h.action('Bob', {
      type: 'take_three',
      colors: ['white', 'blue', 'green'],
    });
    expect(res.ok).toBe(false);
  });

  it('rejects taking from empty pile', () => {
    const h = createGame();
    (h.rawState as any).supply.white = 0;
    const res = h.action('Alice', {
      type: 'take_three',
      colors: ['white', 'blue', 'green'],
    });
    expect(res.ok).toBe(false);
  });
});

describe('Take Two', () => {
  it('takes 2 same color when supply >= 4', () => {
    const h = createGame();
    const res = h.action('Alice', { type: 'take_two', color: 'white' });
    expect(res.ok).toBe(true);
    const me = h.view('Alice').players.find((p) => p.id === 'Alice');
    expect(me!.gems.white).toBe(2);
    expect(h.view('Alice').supply.white).toBe(2);
  });

  it('rejects take_two when supply < 4', () => {
    const h = createGame();
    (h.rawState as any).supply.white = 3;
    const res = h.action('Alice', { type: 'take_two', color: 'white' });
    expect(res.ok).toBe(false);
  });
});

describe('Gem Overflow Discard', () => {
  it('requires discard when >10 gems', () => {
    const h = createGame();
    // seed player with 9 gems
    (h.rawState as any).playerStates.Alice.gems = {
      white: 2,
      blue: 2,
      green: 2,
      red: 2,
      black: 1,
      gold: 0,
    };
    const res = h.action('Alice', {
      type: 'take_three',
      colors: ['white', 'blue', 'green'],
    });
    expect(res.ok).toBe(false);
    expect((res as any).reason).toMatch(/丢弃/);
  });

  it('accepts discard matching overflow', () => {
    const h = createGame();
    (h.rawState as any).playerStates.Alice.gems = {
      white: 2,
      blue: 2,
      green: 2,
      red: 2,
      black: 1,
      gold: 0,
    };
    const res = h.action('Alice', {
      type: 'take_three',
      colors: ['white', 'blue', 'green'],
      discard: { red: 2 },
    });
    expect(res.ok).toBe(true);
    const me = h.view('Bob').players.find((p) => p.id === 'Alice');
    expect(me!.gems.red).toBe(0);
  });
});

describe('Reserve', () => {
  it('reserves a visible card and gains gold', () => {
    const h = createGame();
    const target = h.view('Alice').visible[1][0]!;
    const res = h.action('Alice', {
      type: 'reserve',
      source: 'visible',
      level: 1,
      cardId: target.id,
    });
    expect(res.ok).toBe(true);
    const v = h.view('Alice');
    expect(v.myReserved).toHaveLength(1);
    expect(v.myReserved[0].id).toBe(target.id);
    expect(v.players.find((p) => p.id === 'Alice')!.gems.gold).toBe(1);
    expect(v.supply.gold).toBe(4);
    // slot refilled
    expect(v.visible[1].filter((c) => c !== null).length).toBe(VISIBLE_PER_LEVEL);
  });

  it('reserves from deck (blind)', () => {
    const h = createGame();
    const res = h.action('Alice', {
      type: 'reserve',
      source: 'deck',
      level: 1,
    });
    expect(res.ok).toBe(true);
    expect(h.view('Alice').myReserved).toHaveLength(1);
  });

  it('rejects reserving a 4th card', () => {
    const h = createGame();
    // Manually give Alice 3 reserved cards
    (h.rawState as any).playerStates.Alice.reserved = ALL_CARDS.slice(0, 3);
    const target = h.view('Alice').visible[1][0]!;
    const res = h.action('Alice', {
      type: 'reserve',
      source: 'visible',
      level: 1,
      cardId: target.id,
    });
    expect(res.ok).toBe(false);
  });
});

describe('Buy', () => {
  it('buys a visible card when affordable', () => {
    const h = createGame();
    // Find a cheap card in visible L1 and give Alice enough gems
    const card = h.view('Alice').visible[1].find((c) => c !== null)!;
    (h.rawState as any).playerStates.Alice.gems = {
      white: card.cost.white,
      blue: card.cost.blue,
      green: card.cost.green,
      red: card.cost.red,
      black: card.cost.black,
      gold: 0,
    };
    const res = h.action('Alice', {
      type: 'buy',
      source: 'visible',
      cardId: card.id,
    });
    expect(res.ok).toBe(true);
    const me = h.view('Bob').players.find((p) => p.id === 'Alice')!;
    expect(me.cardCount).toBe(1);
    expect(me.bonuses[card.bonus]).toBe(1);
    expect(me.points).toBe(card.points);
  });

  it('applies bonus discount to cost', () => {
    const h = createGame();
    const card = h.view('Alice').visible[1].find((c) => c !== null && c.cost.white > 0)!;
    // Give bonus to cover 1 white
    (h.rawState as any).playerStates.Alice.bonuses.white = 1;
    (h.rawState as any).playerStates.Alice.gems = {
      white: Math.max(0, card.cost.white - 1),
      blue: card.cost.blue,
      green: card.cost.green,
      red: card.cost.red,
      black: card.cost.black,
      gold: 0,
    };
    const res = h.action('Alice', {
      type: 'buy',
      source: 'visible',
      cardId: card.id,
    });
    expect(res.ok).toBe(true);
  });

  it('uses gold as wildcard', () => {
    const h = createGame();
    const card = h.view('Alice').visible[1].find((c) => c !== null && c.cost.white > 0)!;
    (h.rawState as any).playerStates.Alice.gems = {
      white: card.cost.white - 1,
      blue: card.cost.blue,
      green: card.cost.green,
      red: card.cost.red,
      black: card.cost.black,
      gold: 1,
    };
    const res = h.action('Alice', {
      type: 'buy',
      source: 'visible',
      cardId: card.id,
      gold: { white: 1 },
    });
    expect(res.ok).toBe(true);
  });

  it('rejects buying when unaffordable', () => {
    const h = createGame();
    const card = h.view('Alice').visible[1].find((c) => c !== null)!;
    // Alice has no gems
    const res = h.action('Alice', {
      type: 'buy',
      source: 'visible',
      cardId: card.id,
    });
    expect(res.ok).toBe(false);
  });

  it('buys a reserved card', () => {
    const h = createGame();
    const card = h.view('Alice').visible[1].find((c) => c !== null)!;
    (h.rawState as any).playerStates.Alice.reserved = [card];
    (h.rawState as any).playerStates.Alice.gems = {
      white: card.cost.white,
      blue: card.cost.blue,
      green: card.cost.green,
      red: card.cost.red,
      black: card.cost.black,
      gold: 0,
    };
    const res = h.action('Alice', {
      type: 'buy',
      source: 'reserved',
      cardId: card.id,
    });
    expect(res.ok).toBe(true);
    expect(h.view('Alice').myReserved).toHaveLength(0);
  });
});

describe('Noble Visit', () => {
  it('auto-claims single eligible noble after buy', () => {
    const h = createGame();
    // Force a specific noble needing 4 white 4 blue
    const noble: Noble = {
      id: 'TEST-N',
      points: 3,
      requires: { white: 4, blue: 4, green: 0, red: 0, black: 0 },
    };
    (h.rawState as any).nobles = [noble];

    // Alice already has 4 white bonus + 3 blue bonus and the card she buys gives blue
    (h.rawState as any).playerStates.Alice.bonuses = {
      white: 4,
      blue: 3,
      green: 0,
      red: 0,
      black: 0,
    };
    // Find a L1 blue card Alice can afford for free (ensure she has no gems required)
    const blueCard: Card | undefined = ALL_CARDS.find((c) => c.bonus === 'blue' && c.level === 1);
    (h.rawState as any).visible[1][0] = blueCard;
    // Pay its cost trivially
    (h.rawState as any).playerStates.Alice.gems = {
      white: blueCard!.cost.white,
      blue: blueCard!.cost.blue,
      green: blueCard!.cost.green,
      red: blueCard!.cost.red,
      black: blueCard!.cost.black,
      gold: 0,
    };

    const res = h.action('Alice', {
      type: 'buy',
      source: 'visible',
      cardId: blueCard!.id,
    });
    expect(res.ok).toBe(true);
    const me = h.view('Bob').players.find((p) => p.id === 'Alice')!;
    expect(me.noblesCount).toBe(1);
    expect(me.points).toBe(blueCard!.points + 3);
  });

  it('requires claimNoble when multiple eligible', () => {
    const h = createGame();
    const n1: Noble = {
      id: 'TN1',
      points: 3,
      requires: { white: 4, blue: 4, green: 0, red: 0, black: 0 },
    };
    const n2: Noble = {
      id: 'TN2',
      points: 3,
      requires: { white: 4, blue: 0, green: 0, red: 0, black: 4 },
    };
    (h.rawState as any).nobles = [n1, n2];
    (h.rawState as any).playerStates.Alice.bonuses = {
      white: 3,
      blue: 4,
      green: 0,
      red: 0,
      black: 4,
    };
    const whiteCard = ALL_CARDS.find((c) => c.bonus === 'white' && c.level === 1)!;
    (h.rawState as any).visible[1][0] = whiteCard;
    (h.rawState as any).playerStates.Alice.gems = {
      white: whiteCard.cost.white,
      blue: whiteCard.cost.blue,
      green: whiteCard.cost.green,
      red: whiteCard.cost.red,
      black: whiteCard.cost.black,
      gold: 0,
    };

    const res = h.action('Alice', {
      type: 'buy',
      source: 'visible',
      cardId: whiteCard.id,
    });
    expect(res.ok).toBe(false);
    expect((res as any).reason).toMatch(/贵族/);
  });
});

describe('Hidden Information', () => {
  it('does not leak reserved cards to other players', () => {
    const h = createGame();
    const target = h.view('Alice').visible[1][0]!;
    h.action('Alice', {
      type: 'reserve',
      source: 'visible',
      level: 1,
      cardId: target.id,
    });
    // Alice sees her reserved, Bob sees an empty myReserved
    expect(h.view('Alice').myReserved).toHaveLength(1);
    expect(h.view('Bob').myReserved).toHaveLength(0);
    // But Bob sees the count via PlayerInfo
    const alice = h.view('Bob').players.find((p) => p.id === 'Alice')!;
    expect(alice.reservedCount).toBe(1);
    h.expectViewsDiffer('myReserved', 'Alice', 'Bob');
  });
});

describe('Win Condition', () => {
  it('ends the game after reaching WIN_POINTS and round completes', () => {
    const h = createGame(['Alice', 'Bob']);
    // Directly set Alice points to WIN_POINTS
    (h.rawState as any).playerStates.Alice.points = WIN_POINTS;
    // Alice's turn — any legal action will trigger last-round logic
    h.action('Alice', { type: 'take_three', colors: ['white', 'blue', 'green'] });
    expect(h.isFinished).toBe(false);
    // Bob plays — last-round completes, game ends
    h.action('Bob', { type: 'take_three', colors: ['white', 'blue', 'green'] });
    expect(h.isFinished).toBe(true);
    expect(h.rankings?.[0]).toBe('Alice');
  });

  it('tiebreaks by fewest cards when points tie', () => {
    const h = createGame(['Alice', 'Bob']);
    (h.rawState as any).playerStates.Alice.points = WIN_POINTS;
    (h.rawState as any).playerStates.Bob.points = WIN_POINTS;
    (h.rawState as any).playerStates.Alice.cards = [];
    (h.rawState as any).playerStates.Bob.cards = [ALL_CARDS[0]];
    h.action('Alice', { type: 'take_three', colors: ['white', 'blue', 'green'] });
    h.action('Bob', { type: 'take_three', colors: ['white', 'blue', 'green'] });
    expect(h.rankings?.[0]).toBe('Alice');
  });
});
