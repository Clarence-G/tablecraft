import type {
  Ack,
  ActionResult,
  EngineEvent,
  GameContext,
  GameLogic,
  GameMeta,
  PlayerInfo,
  RoomState,
  RoomStatus,
  RoomSummary,
} from '@repo/shared';
import { customAlphabet, nanoid } from 'nanoid';
import { recordPoints } from '../lib/ledger.js';
import { RandomProvider } from './RandomProvider';
import { TimerManager } from './TimerManager';

const roomIdAlphabet = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 6);

type BroadcastFn = (roomId: string, playerViews: Map<string, unknown>) => void;

/**
 * Structured outcome of attempting an action. Both WebSocket (`handleAction`)
 * and REST (`submitAction`) entry points share the same pipeline via
 * `tryAction`; they only differ in how each outcome is delivered to the caller.
 */
type ActionOutcome =
  | { kind: 'ok'; seq: number }
  | { kind: 'throttled' }
  | { kind: 'stale-seq'; currentSeq: number }
  | { kind: 'not-playing'; status: RoomStatus }
  | { kind: 'invalid'; reason: string }
  | { kind: 'rejected'; reason: string }
  | { kind: 'internal-error' };

export class GameRoom {
  roomId: string;
  gameId: string;
  meta: GameMeta;
  status: RoomStatus;
  players: Map<string, PlayerInfo>;
  state: unknown;
  config: unknown;
  logic: GameLogic;
  ctx: GameContext;
  timerManager: TimerManager;
  lastSeq: Map<string, number>;
  lastActionTime: Map<string, number>;
  finishedAt: number | null;
  lastActivityAt: number;
  createdAt: number;
  seq = 0;
  rankings: string[] | null = null;
  private waiters: Array<(seq: number) => void> = [];

  private broadcast: BroadcastFn | null = null;

  constructor(gameId: string, meta: GameMeta, config?: unknown, logic?: GameLogic) {
    this.roomId = roomIdAlphabet();
    this.gameId = gameId;
    this.meta = meta;
    this.status = 'waiting';
    this.players = new Map();
    this.state = null;
    this.config = config ?? meta.defaultConfig;
    this.logic = logic!;
    this.ctx = { players: [], random: new RandomProvider(nanoid()) };
    this.timerManager = new TimerManager();
    this.lastSeq = new Map();
    this.lastActionTime = new Map();
    this.finishedAt = null;
    this.lastActivityAt = Date.now();
    this.createdAt = Date.now();
  }

  setBroadcast(fn: BroadcastFn) {
    this.broadcast = fn;
  }

  get hostId(): string {
    return [...this.players.values()][0]?.id ?? '';
  }

  join(playerID: string, name: string, isBot = false, isGuest = true): Ack<void> {
    if (this.status !== 'waiting') {
      return { ok: false, error: 'Game already started' };
    }
    if (this.players.has(playerID)) {
      return { ok: true, data: undefined };
    }
    const seatIndex = this.players.size;
    this.players.set(playerID, {
      id: playerID,
      name,
      ready: isBot,
      connected: true,
      seatIndex,
      isBot,
      isGuest,
    });
    this.lastActivityAt = Date.now();
    return { ok: true, data: undefined };
  }

  leave(playerID: string): void {
    this.players.delete(playerID);
    this.lastActivityAt = Date.now();
  }

  ready(playerID: string): void {
    const player = this.players.get(playerID);
    if (player) {
      this.players.set(playerID, { ...player, ready: true });
      this.lastActivityAt = Date.now();
    }
  }

  start(): Ack<void> {
    if (this.status !== 'waiting') {
      return { ok: false, error: 'Room not in waiting state' };
    }
    if (this.players.size < this.meta.minPlayers) {
      return { ok: false, error: `Need at least ${this.meta.minPlayers} players` };
    }
    const playerList = [...this.players.values()];
    if (!playerList.every((p) => p.ready)) {
      return { ok: false, error: 'Not all players are ready' };
    }
    const seed = nanoid();
    this.ctx = {
      players: playerList.map((p) => p.id),
      random: new RandomProvider(seed),
    };
    this.state = this.logic.setup(this.ctx, this.config);
    this.status = 'playing';
    this.lastActivityAt = Date.now();
    this.onStateChanged();
    return { ok: true, data: undefined };
  }

  handleAction(playerID: string, rawAction: unknown, seq: number): void {
    const outcome = this.tryAction(playerID, rawAction, seq);
    switch (outcome.kind) {
      case 'throttled':
        this.emitToPlayer(playerID, 'game:reject', 'Too fast');
        return;
      case 'invalid':
      case 'rejected':
        this.emitToPlayer(playerID, 'game:reject', outcome.reason);
        return;
      case 'internal-error':
        this.emitToPlayer(playerID, 'game:reject', 'Internal error');
        return;
      case 'stale-seq':
      case 'not-playing':
      case 'ok':
        return;
    }
  }

  handleTimer(timerName: string): void {
    if (!this.logic.onTimer || this.status !== 'playing') return;
    let result: ActionResult<unknown>;
    try {
      result = this.logic.onTimer(this.state, timerName, this.ctx);
    } catch (e) {
      console.error('onTimer threw:', e);
      return;
    }
    if (!result.ok) return;
    this.state = result.state;
    this.processEvents(result.events ?? []);
    this.broadcastViews();
    this.onStateChanged();
  }

  markDisconnected(playerID: string): void {
    const player = this.players.get(playerID);
    if (player) {
      this.players.set(playerID, { ...player, connected: false });
    }
    if (this.status !== 'playing' || !this.logic.onPlayerDisconnect) return;
    let result: ActionResult<unknown>;
    try {
      result = this.logic.onPlayerDisconnect(this.state, playerID, this.ctx);
    } catch (e) {
      console.error('onPlayerDisconnect threw:', e);
      return;
    }
    if (!result.ok) return;
    this.state = result.state;
    this.lastActivityAt = Date.now();
    this.processEvents(result.events ?? []);
    this.broadcastViews();
    this.onStateChanged();
  }

  markReconnected(playerID: string): void {
    const player = this.players.get(playerID);
    if (player) {
      this.players.set(playerID, { ...player, connected: true });
    }
  }

  restart(): void {
    this.status = 'waiting';
    this.state = null;
    this.finishedAt = null;
    this.lastSeq.clear();
    this.lastActionTime.clear();
    this.timerManager.clearAll();
    for (const [id, player] of this.players) {
      this.players.set(id, { ...player, ready: player.isBot });
    }
    this.lastActivityAt = Date.now();
  }

  onStateChanged(): void {
    this.seq++;
    const cbs = this.waiters.splice(0);
    for (const cb of cbs) cb(this.seq);
  }

  waitForChange(afterSeq: number, timeoutMs: number): Promise<number | null> {
    if (this.seq > afterSeq) return Promise.resolve(this.seq);
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter((cb) => cb !== resolve);
        resolve(null);
      }, timeoutMs);
      const cb = (newSeq: number) => {
        clearTimeout(timer);
        resolve(newSeq);
      };
      this.waiters.push(cb);
    });
  }

  /** Submit action via REST API — returns result instead of emitting via socket */
  submitAction(
    playerID: string,
    rawAction: unknown,
    seq?: number,
  ): { ok: true; seq: number } | { ok: false; error: string; reason: string } {
    const outcome = this.tryAction(playerID, rawAction, seq);
    switch (outcome.kind) {
      case 'ok':
        return { ok: true, seq: outcome.seq };
      case 'stale-seq':
        // Idempotent: duplicate seq is treated as success at the REST boundary
        return { ok: true, seq: outcome.currentSeq };
      case 'throttled':
        return { ok: false, error: 'THROTTLED', reason: 'Too fast' };
      case 'not-playing':
        return {
          ok: false,
          error: 'GAME_NOT_STARTED',
          reason: `Room status is "${outcome.status}"`,
        };
      case 'invalid':
        return { ok: false, error: 'INVALID_ACTION', reason: outcome.reason };
      case 'rejected':
        return { ok: false, error: 'ACTION_REJECTED', reason: outcome.reason };
      case 'internal-error':
        return { ok: false, error: 'ACTION_REJECTED', reason: 'Internal game logic error' };
    }
  }

  toRoomState(): RoomState {
    return {
      roomId: this.roomId,
      gameId: this.gameId,
      status: this.status,
      hostId: this.hostId,
      players: [...this.players.values()],
      minPlayers: this.meta.minPlayers,
      maxPlayers: this.ctx.players.length || this.players.size,
      config: this.config,
      createdAt: this.createdAt,
    };
  }

  toRoomSummary(): RoomSummary {
    const host = this.players.get(this.hostId);
    return {
      roomId: this.roomId,
      gameId: this.gameId,
      gameName: this.meta.name,
      hostName: host?.name ?? '',
      playerCount: this.players.size,
      maxPlayers: this.meta.maxPlayers,
    };
  }

  serialize(): object {
    return {
      id: this.roomId,
      gameId: this.gameId,
      status: this.status,
      hostId: this.hostId,
      configJson: JSON.stringify(this.config),
      seed: this.ctx.random.seed,
      stateJson: JSON.stringify(this.state),
      createdAt: this.createdAt,
      updatedAt: Date.now(),
      finishedAt: this.finishedAt,
    };
  }

  /**
   * Core action pipeline shared by `handleAction` (socket) and `submitAction`
   * (REST). Does parse → logic → state update → events → broadcast, returning
   * a structured outcome. Callers translate the outcome into their transport's
   * error format.
   *
   * `seq === undefined` (REST default) means "auto-assign next seq". A given
   * number means "only accept if strictly greater than lastSeq for this player
   * (socket) or equal to next expected (REST idempotency)".
   */
  private tryAction(playerID: string, rawAction: unknown, seq: number | undefined): ActionOutcome {
    if (this.status !== 'playing') {
      return { kind: 'not-playing', status: this.status };
    }

    // Stale seq is checked BEFORE throttle: a duplicate submission must stay
    // idempotent even if it lands inside the throttle window — otherwise
    // retrying after a dropped response would falsely return 429.
    const prevSeq = this.lastSeq.get(playerID) ?? -1;
    const effectiveSeq = seq ?? prevSeq + 1;
    if (effectiveSeq <= prevSeq) {
      return { kind: 'stale-seq', currentSeq: prevSeq };
    }

    const throttleMs = this.meta.actionThrottleMs ?? 100;
    const now = Date.now();
    const lastTime = this.lastActionTime.get(playerID) ?? 0;
    if (now - lastTime < throttleMs) {
      return { kind: 'throttled' };
    }

    const parsed = this.logic.actions.safeParse(rawAction);
    if (!parsed.success) {
      return { kind: 'invalid', reason: parsed.error.message };
    }

    let result: ActionResult<unknown>;
    try {
      result = this.logic.onAction(this.state, parsed.data, playerID, this.ctx);
    } catch (e) {
      console.error('onAction threw:', e);
      return { kind: 'internal-error' };
    }

    if (!result.ok) {
      return { kind: 'rejected', reason: result.reason };
    }

    this.state = result.state;
    this.lastSeq.set(playerID, effectiveSeq);
    this.lastActionTime.set(playerID, now);
    this.lastActivityAt = now;
    this.processEvents(result.events ?? []);
    this.broadcastViews();
    this.onStateChanged();
    return { kind: 'ok', seq: effectiveSeq };
  }

  private processEvents(events: EngineEvent[]): void {
    for (const event of events) {
      switch (event.type) {
        case 'SET_TIMER':
          this.timerManager.set(event.name, event.ms, () => this.handleTimer(event.name));
          break;
        case 'CLEAR_TIMER':
          this.timerManager.clear(event.name);
          break;
        case 'NOTIFY':
          this.emitToPlayer(event.to, 'game:notify', event.payload);
          break;
        case 'NOTIFY_ALL':
          for (const pid of this.players.keys()) {
            this.emitToPlayer(pid, 'game:notify', event.payload);
          }
          break;
        case 'END_GAME':
          this.rankings = event.rankings;
          this.status = 'finished';
          this.finishedAt = Date.now();
          this.timerManager.clearAll();
          for (const pid of this.players.keys()) {
            this.emitToPlayer(pid, 'game:end', event.rankings);
          }
          this.writePointsLedger(event.rankings);
          break;
      }
    }
  }

  /**
   * Fire-and-forget ledger writes for every human finisher. Spec §4.4:
   * - Bots are skipped (no bot ranking in this release).
   * - Winner = rankings[0] (single winner). Others get 'loss' (0 points → skipped).
   * - PlayerInfo.isGuest routes the row to user_id vs guest_id; missing field
   *   defaults to guest (conservative — writing to the unique user_id column
   *   requires a real FK target).
   */
  private writePointsLedger(rankings: string[]): void {
    if (rankings.length === 0) return;
    const winnerId = rankings[0];
    for (const [pid, info] of this.players) {
      if (info.isBot) continue;
      const isGuest = info.isGuest ?? true;
      const reason: 'win' | 'loss' = pid === winnerId ? 'win' : 'loss';
      void recordPoints({
        userId: isGuest ? null : pid,
        guestId: isGuest ? pid : null,
        gameId: this.gameId,
        roomId: this.roomId,
        reason,
      });
    }
  }

  private broadcastViews(): void {
    if (!this.broadcast) return;
    const views = new Map<string, unknown>();
    for (const pid of this.players.keys()) {
      views.set(pid, this.logic.getPlayerView(this.state, pid));
    }
    this.broadcast(this.roomId, views);
  }

  // emitToPlayer is set externally by socket handlers
  emitToPlayer: (playerID: string, event: string, data?: unknown) => void = () => {};
}
