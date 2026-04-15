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
}

export class GameTestHarness<TState, TAction, TView> {
  private logic: GameLogic<TState, TAction, TView>;
  private _state!: TState;
  private _ctx: GameContext;
  private _lastEvents: EngineEvent[] = [];
  private _allEvents: EngineEvent[] = [];
  private config: unknown;

  constructor(logic: GameLogic<TState, TAction, TView>, options: HarnessOptions) {
    this.logic = logic;
    this.config = options.config;
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

    const result = this.logic.onAction(this._state, parsed.data, playerID, this._ctx);
    if (result.ok) {
      this._state = result.state;
      this._lastEvents = result.events ?? [];
      this._allEvents.push(...this._lastEvents);
    } else {
      this._lastEvents = [];
    }
    return result;
  }

  timer(name: string): ActionResult<TState> {
    if (!this.logic.onTimer) throw new Error('Game does not implement onTimer');
    const result = this.logic.onTimer(this._state, name, this._ctx);
    if (result.ok) {
      this._state = result.state;
      this._lastEvents = result.events ?? [];
      this._allEvents.push(...this._lastEvents);
    } else {
      this._lastEvents = [];
    }
    return result;
  }

  view(playerID: string): TView {
    return this.logic.getPlayerView(this._state, playerID);
  }

  spectatorView(): TView | undefined {
    return this.logic.getSpectatorView?.(this._state);
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
