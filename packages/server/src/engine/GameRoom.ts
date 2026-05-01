import type {
  Ack,
  ActionResult,
  ChatMessage,
  EngineEvent,
  GameContext,
  GameLogic,
  GameMeta,
  PlayerInfo,
  RoomState,
  RoomStatus,
  RoomSummary,
} from '@repo/shared';
import { eq } from 'drizzle-orm';
import { customAlphabet, nanoid } from 'nanoid';
import { db } from '../db/index.js';
import { rooms } from '../db/schema.js';
import { logger } from '../lib/logger.js';
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
  /** Last N chat messages in this room. Not persisted across server restarts. */
  chatHistory: ChatMessage[] = [];
  private static readonly CHAT_HISTORY_LIMIT = 50;
  /**
   * Last N Activity Log entries (notifications on `channel: 'log'`). Kept for
   * HTTP /state consumers (CLI bots, JSON clients) that don't subscribe to
   * live socket events. Socket clients build their own log from `game:notify`.
   * Not persisted across server restarts.
   */
  logHistory: unknown[] = [];
  private static readonly LOG_HISTORY_LIMIT = 100;
  private waiters: Array<(seq: number) => void> = [];

  /** Players currently holding an open socket connection. */
  connectedPlayerIds: Set<string> = new Set();

  /** userId → socketId for active spectators. */
  spectators: Map<string, string> = new Map();

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

  /** Restore a room from a persisted DB row + related records. */
  static fromPersisted(
    row: { id: string; gameId: string; status: string; configJson: string | null; seed: string | null; createdAt: Date | null; finishedAt: Date | null },
    state: unknown,
    players: Array<{ userId: string; seatIndex: number; ready: boolean }>,
    chatMessages: Array<{ id: string; userId: string; userName: string; text: string; createdAt: Date | null }>,
    meta: GameMeta,
    logic: GameLogic,
  ): GameRoom {
    const room = new GameRoom(row.gameId, meta, undefined, logic);
    room.roomId = row.id;
    room.status = row.status as RoomStatus;
    room.state = state;
    room.config = row.configJson ? JSON.parse(row.configJson) : meta.defaultConfig;
    room.createdAt = row.createdAt ? row.createdAt.getTime() : Date.now();
    room.finishedAt = row.finishedAt ? row.finishedAt.getTime() : null;
    room.ctx = {
      players: players.map((p) => p.userId),
      random: new RandomProvider(row.seed ?? nanoid()),
    };
    for (const p of players) {
      room.players.set(p.userId, {
        id: p.userId,
        name: p.userId,
        ready: p.ready,
        connected: false,
        seatIndex: p.seatIndex,
        isBot: false,
        isGuest: true,
      });
    }
    for (const msg of chatMessages) {
      room.chatHistory.push({
        id: msg.id,
        from: msg.userId,
        fromName: msg.userName,
        text: msg.text,
        at: msg.createdAt ? msg.createdAt.getTime() : Date.now(),
      });
    }
    return room;
  }

  appendChatMessage(msg: ChatMessage): void {
    this.chatHistory.push(msg);
    if (this.chatHistory.length > GameRoom.CHAT_HISTORY_LIMIT) {
      this.chatHistory.splice(0, this.chatHistory.length - GameRoom.CHAT_HISTORY_LIMIT);
    }
    this.lastActivityAt = Date.now();
  }

  /**
   * Append a notification payload to the Activity Log history — but only if
   * it's on the 'log' sub-channel. Game-specific UI payloads (e.g. private
   * card reveals) don't belong in the log. See docs/ACTIVITY_LOG.md.
   */
  private appendToLogHistory(payload: unknown): void {
    if (payload === null || typeof payload !== 'object') return;
    if ((payload as Record<string, unknown>).channel !== 'log') return;
    this.logHistory.push(payload);
    if (this.logHistory.length > GameRoom.LOG_HISTORY_LIMIT) {
      this.logHistory.splice(0, this.logHistory.length - GameRoom.LOG_HISTORY_LIMIT);
    }
  }

  get hostId(): string {
    return [...this.players.values()][0]?.id ?? '';
  }

  join(playerID: string, name: string, isBot = false, isGuest = true): Ack<void> {
    // Idempotent for existing members — allows URL-driven rejoin after refresh
    // even when the game is already in progress, or when the room is full.
    if (this.players.has(playerID)) {
      return { ok: true, data: undefined };
    }
    if (this.status !== 'waiting') {
      return { ok: false, error: 'Game already started' };
    }
    if (this.players.size >= this.meta.maxPlayers) {
      return { ok: false, error: 'Room is full' };
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
    void this.persistState();
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
    void this.persistState();
  }

  markDisconnected(playerID: string): void {
    const player = this.players.get(playerID);
    if (player) {
      this.players.set(playerID, { ...player, connected: false });
    }
    this.connectedPlayerIds.delete(playerID);
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
    void this.persistState();
  }

  markReconnected(playerID: string): void {
    const player = this.players.get(playerID);
    if (player) {
      this.players.set(playerID, { ...player, connected: true });
    }
    this.connectedPlayerIds.add(playerID);
  }

  addSpectator(userId: string, socketId: string): void {
    this.spectators.set(userId, socketId);
  }

  removeSpectator(userId: string): void {
    this.spectators.delete(userId);
  }

  /** Sanitized view safe for spectators — no private hand/card/role info. */
  spectatorView(): unknown {
    if (this.logic.getSpectatorView) {
      return this.logic.getSpectatorView(this.state);
    }
    const state = this.state as Record<string, unknown>;
    if (!Array.isArray(state.players)) return state;
    const PRIVATE_KEYS = ['hand', 'hole', 'holeCards', 'role', 'word', 'secret'];
    const players = (state.players as Array<Record<string, unknown>>).map((p) => {
      const cleaned = { ...p };
      for (const key of PRIVATE_KEYS) delete cleaned[key];
      return cleaned;
    });
    return { ...state, players };
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
      spectatorCount: this.spectators.size,
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
      status: this.status,
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
    void this.persistState();
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
          this.appendToLogHistory(event.payload);
          this.emitToPlayer(event.to, 'game:notify', event.payload);
          break;
        case 'NOTIFY_ALL':
          this.appendToLogHistory(event.payload);
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
    const connected = [...this.connectedPlayerIds];
    for (const pid of this.players.keys()) {
      const view = this.logic.getPlayerView(this.state, pid);
      views.set(pid, { ...(view as object), _connected: connected });
    }
    this.broadcast(this.roomId, views);
    if (this.spectators.size > 0) {
      this.emitSpectators('spectator:state', this.spectatorView());
    }
  }

  /** Persist current state to the rooms table. Fire-and-forget; never throws. */
  async persistState(): Promise<void> {
    if (this.state == null) return;
    try {
      await db.update(rooms)
        .set({
          stateJson: JSON.stringify(this.state),
          status: this.status,
          updatedAt: new Date(),
          ...(this.status === 'finished' && { finishedAt: new Date() }),
        })
        .where(eq(rooms.id, this.roomId));
    } catch (err) {
      logger.error({ err, roomId: this.roomId, mod: 'gameroom' }, 'persistState failed');
    }
  }

  /**
   * Called after AFK grace period. If logic supports onPlayerDisconnect, invoke
   * it to let the game advance. Otherwise just notify the room.
   * Returns whether state changed (so caller can re-broadcast).
   */
  handleAfk(userId: string): { stateChanged: boolean } {
    if (this.status !== 'playing') return { stateChanged: false };
    if (this.logic.onPlayerDisconnect) {
      let result: ActionResult<unknown>;
      try {
        result = this.logic.onPlayerDisconnect(this.state, userId, this.ctx);
      } catch (e) {
        logger.error({ err: e, roomId: this.roomId, userId, mod: 'afk' }, 'onPlayerDisconnect threw');
        return { stateChanged: false };
      }
      if (!result.ok) return { stateChanged: false };
      this.state = result.state;
      this.lastActivityAt = Date.now();
      this.processEvents(result.events ?? []);
      this.onStateChanged();
      return { stateChanged: true };
    }
    // Fallback: emit a system notification so clients can show "player offline" banner
    for (const pid of this.players.keys()) {
      this.emitToPlayer(pid, 'game:notify', {
        channel: 'log',
        key: 'log.playerTimeout',
        messageParams: { playerId: userId },
      });
    }
    return { stateChanged: false };
  }

  // emitToPlayer is set externally by socket handlers
  emitToPlayer: (playerID: string, event: string, data?: unknown) => void = () => {};

  // emitSpectators is set externally by socket handlers
  emitSpectators: (event: string, data: unknown) => void = () => {};
}
