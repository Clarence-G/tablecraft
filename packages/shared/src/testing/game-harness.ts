import seedrandom from 'seedrandom';
import type {
  ActionResult,
  EngineEvent,
  GameContext,
  GameLogic,
  SeededRandom,
} from '../types/engine';

export interface HarnessOptions {
  players: string[];
  seed?: string;
  config?: unknown;
  /**
   * When true (default), the state passed into `onAction` / `onTimer` /
   * `onPlayerDisconnect` is a deep-frozen clone of the harness state.
   * Any attempt by the logic to mutate its input will throw a TypeError —
   * catching the classic "returned the same reference after mutating" bug.
   * Turn off only when you have a very good reason (e.g. perf in large fuzz runs).
   */
  freezeInput?: boolean;
}

export class GameTestHarness<TState, TAction, TView> {
  private logic: GameLogic<TState, TAction, TView>;
  private _state!: TState;
  private _ctx: GameContext;
  private _lastEvents: EngineEvent[] = [];
  private _allEvents: EngineEvent[] = [];
  private config: unknown;
  private freezeInput: boolean;

  constructor(logic: GameLogic<TState, TAction, TView>, options: HarnessOptions) {
    this.logic = logic;
    this.config = options.config;
    this.freezeInput = options.freezeInput ?? true;
    const seed = options.seed ?? `test-${Date.now()}`;
    this._ctx = {
      players: options.players,
      random: createSeededRandom(seed),
    };
  }

  setup(): void {
    this._state = this.logic.setup(this._ctx, this.config);
  }

  action(playerID: string, action: TAction): ActionResult<TState> {
    const parsed = this.logic.actions.safeParse(action);
    if (!parsed.success) {
      return { ok: false, reason: `Zod validation: ${parsed.error.message}` };
    }

    const input = this.protectedInput();
    const result = this.logic.onAction(input, parsed.data, playerID, this._ctx);
    this.applyResult(result);
    return result;
  }

  timer(name: string): ActionResult<TState> {
    if (!this.logic.onTimer) throw new Error('Game does not implement onTimer');
    const input = this.protectedInput();
    const result = this.logic.onTimer(input, name, this._ctx);
    this.applyResult(result);
    return result;
  }

  /**
   * Invoke `logic.onPlayerDisconnect` with the current state. Mirrors how
   * the live engine handles a socket disconnect — lets tests verify that
   * folding / auto-pass / turn advancement works without spinning up sockets.
   */
  disconnect(playerID: string): ActionResult<TState> {
    if (!this.logic.onPlayerDisconnect) {
      throw new Error('Game does not implement onPlayerDisconnect');
    }
    const input = this.protectedInput();
    const result = this.logic.onPlayerDisconnect(input, playerID, this._ctx);
    this.applyResult(result);
    return result;
  }

  view(playerID: string): TView {
    return this.logic.getPlayerView(this._state, playerID);
  }

  spectatorView(): TView | undefined {
    return this.logic.getSpectatorView?.(this._state);
  }

  /**
   * Assert that a given view field differs between two players. Use this in
   * tests for games with hidden information (hands, roles, secret bids) to
   * catch regressions where `getPlayerView` accidentally leaks private state
   * to other players.
   *
   * Example:
   *   h.expectViewsDiffer('myHoleCards', 'alice', 'bob');
   *   h.expectViewsDiffer('players', 'alice', 'bob'); // each sees only own holeCards
   */
  expectViewsDiffer<K extends keyof TView>(field: K, viewerA: string, viewerB: string): void {
    const a = this.view(viewerA)[field];
    const b = this.view(viewerB)[field];
    if (stableStringify(a) === stableStringify(b)) {
      throw new Error(
        `Hidden info leak: field "${String(field)}" is identical for "${viewerA}" and "${viewerB}". ` +
          `Both see: ${stableStringify(a)}`,
      );
    }
  }

  get lastEvents(): EngineEvent[] {
    return this._lastEvents;
  }
  get allEvents(): EngineEvent[] {
    return [...this._allEvents];
  }

  get isFinished(): boolean {
    return this._allEvents.some((e) => e.type === 'END_GAME');
  }

  get rankings(): string[] | null {
    const end = [...this._allEvents].reverse().find((e) => e.type === 'END_GAME');
    return end ? (end as Extract<EngineEvent, { type: 'END_GAME' }>).rankings : null;
  }

  get rawState(): TState {
    return this._state;
  }
  get players(): string[] {
    return this._ctx.players;
  }

  private protectedInput(): TState {
    if (!this.freezeInput) return this._state;
    return deepFreeze(structuredClone(this._state));
  }

  private applyResult(result: ActionResult<TState>): void {
    if (result.ok) {
      // Logic may have returned a new state object that still references frozen
      // subtrees from the input (e.g. `{ ...state, foo: newFoo }` keeps the same
      // array references). Clone once more so tests can patch rawState freely.
      this._state = this.freezeInput ? structuredClone(result.state) : result.state;
      this._lastEvents = result.events ?? [];
      this._allEvents.push(...this._lastEvents);
    } else {
      this._lastEvents = [];
    }
  }
}

function createSeededRandom(seed: string): SeededRandom {
  const rng = seedrandom(seed);
  return {
    seed,
    int(min, max) {
      return min + Math.floor(rng() * (max - min + 1));
    },
    float() {
      return rng();
    },
    shuffle<T>(arr: T[]): T[] {
      const result = [...arr];
      for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
      }
      return result;
    },
  };
}

function deepFreeze<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object' || Object.isFrozen(obj)) return obj;
  Object.freeze(obj);
  for (const key of Object.keys(obj as object)) {
    deepFreeze((obj as Record<string, unknown>)[key]);
  }
  return obj;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, v) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      return Object.keys(v as object)
        .sort()
        .reduce<Record<string, unknown>>((acc, k) => {
          acc[k] = (v as Record<string, unknown>)[k];
          return acc;
        }, {});
    }
    return v;
  });
}
