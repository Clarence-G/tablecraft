import type { z } from 'zod';

/** Per-game theming for the Play Surface (Zone C). All fields optional; omitting
 * the whole field keeps the default platform cream look. */
export type SceneTexture = 'wood' | 'felt' | 'velvet' | 'leather' | 'paper' | null;
export type SceneAmbienceKind = 'spotlight' | 'ambient' | 'none';
export type SceneAmbienceWarmth = 'warm' | 'cool' | 'neutral';

export interface GameScene {
  surface?: {
    /** CSS color for the play surface background. */
    color?: string;
    /** Subtle CSS-gradient overlay applied on top of the surface color. */
    texture?: SceneTexture;
    /** Accent color used by the surface for highlights (e.g. spotlight tint). */
    accent?: string;
  };
  ambience?: {
    type?: SceneAmbienceKind;
    warmth?: SceneAmbienceWarmth;
    /** 0..1 controlling spotlight opacity/spread. */
    intensity?: number;
  };
}

/** 游戏元信息 */
export interface GameMeta {
  id: string;
  name: string;
  description: string;
  minPlayers: number;
  maxPlayers: number;
  tags?: string[];
  /** Lucide icon name, e.g. 'Target', 'Heart' */
  icon?: string;
  /** Estimated play time in minutes */
  estimatedMinutes?: number;
  actionThrottleMs?: number;
  configSchema?: z.ZodTypeAny;
  defaultConfig?: unknown;
  /** Human-readable game rules (displayed in room UI) */
  rules?: string;
  /** Machine-readable rules for agents (action format, view schema, error cases) */
  agentRules?: string;
  /** Optional per-game theming of the Play Surface (colors, texture, ambience).
   * Backward compatible: omitting this keeps the default cream look. */
  scene?: GameScene;
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
  | { type: 'END_GAME'; rankings: string[]; ties?: string[][] };

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
  meta: Pick<
    GameMeta,
    | 'id'
    | 'name'
    | 'description'
    | 'minPlayers'
    | 'maxPlayers'
    | 'tags'
    | 'icon'
    | 'estimatedMinutes'
    | 'rules'
    | 'scene'
  >;
  Board: React.LazyExoticComponent<React.ComponentType<any>> | React.ComponentType<any>;
}
