import type { z } from 'zod';

/** 游戏元信息 */
export interface GameMeta {
  id: string;
  name: string;
  description: string;
  minPlayers: number;
  maxPlayers: number;
  tags?: string[];
  actionThrottleMs?: number;
  configSchema?: z.ZodType;
  defaultConfig?: unknown;
}

/** 引擎提供给游戏逻辑的上下文 */
export interface GameContext {
  players: string[];
  random: SeededRandom;
}

export interface SeededRandom {
  shuffle<T>(arr: T[]): T[];
  int(min: number, max: number): number;
  float(): number;
  seed: string;
}

/** 引擎事件 */
export type EngineEvent =
  | { type: 'SET_TIMER'; name: string; ms: number }
  | { type: 'CLEAR_TIMER'; name: string }
  | { type: 'NOTIFY'; to: string; payload: unknown }
  | { type: 'NOTIFY_ALL'; payload: unknown }
  | { type: 'END_GAME'; rankings: string[] };

/** onAction / onTimer 的返回值 */
export type ActionResult<S> =
  | { ok: true; state: S; events?: EngineEvent[] }
  | { ok: false; reason: string };

/** AI 实现此接口 */
export interface GameLogic<TState = any, TAction = any, TView = any> {
  actions: z.ZodType<TAction>;
  setup(ctx: GameContext, config?: unknown): TState;
  onAction(
    state: TState,
    action: TAction,
    playerID: string,
    ctx: GameContext,
  ): ActionResult<TState>;
  getPlayerView(state: TState, playerID: string): TView;
  getSpectatorView?(state: TState): TView;
  onTimer?(state: TState, timerName: string, ctx: GameContext): ActionResult<TState>;
  onPlayerDisconnect?(state: TState, playerID: string, ctx: GameContext): ActionResult<TState>;
}

/** 服务端注册表条目 */
export interface ServerGamePlugin {
  meta: GameMeta;
  logic: GameLogic;
}

/** 客户端注册表条目 */
export interface ClientGamePlugin {
  meta: Pick<GameMeta, 'id' | 'name' | 'description' | 'minPlayers' | 'maxPlayers' | 'tags'>;
  Board: React.LazyExoticComponent<React.ComponentType<any>> | React.ComponentType<any>;
}
