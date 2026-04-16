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
import { RandomProvider } from './RandomProvider';
import { TimerManager } from './TimerManager';

const roomIdAlphabet = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 6);

type BroadcastFn = (roomId: string, playerViews: Map<string, unknown>) => void;

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
  seq: number = 0;
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

  join(playerID: string, name: string, isBot = false): Ack<void> {
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
    if (this.status !== 'playing') return;

    const throttleMs = 100;
    const now = Date.now();
    const lastTime = this.lastActionTime.get(playerID) ?? 0;
    if (now - lastTime < throttleMs) {
      this.emitToPlayer(playerID, 'game:reject', 'Too fast');
      return;
    }

    const lastSeq = this.lastSeq.get(playerID) ?? -1;
    if (seq <= lastSeq) return;

    const parsed = this.logic.actions.safeParse(rawAction);
    if (!parsed.success) {
      this.emitToPlayer(playerID, 'game:reject', parsed.error.message);
      return;
    }

    let result: ActionResult<unknown>;
    try {
      result = this.logic.onAction(this.state, parsed.data, playerID, this.ctx);
    } catch (e) {
      console.error('onAction threw:', e);
      this.emitToPlayer(playerID, 'game:reject', 'Internal error');
      return;
    }

    if (!result.ok) {
      this.emitToPlayer(playerID, 'game:reject', result.reason);
      return;
    }

    this.state = result.state;
    this.lastSeq.set(playerID, seq);
    this.lastActionTime.set(playerID, now);
    this.lastActivityAt = now;
    this.processEvents(result.events ?? []);
    this.broadcastViews();
    this.onStateChanged();
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
    if (this.status !== 'playing') {
      return { ok: false, error: 'GAME_NOT_STARTED', reason: `Room status is "${this.status}"` };
    }

    const prevSeq = this.lastSeq.get(playerID) ?? -1;
    const actualSeq = seq !== undefined ? seq : prevSeq + 1;

    // Idempotent: duplicate seq
    if (actualSeq <= prevSeq) {
      return { ok: true, seq: actualSeq };
    }

    const parsed = this.logic.actions.safeParse(rawAction);
    if (!parsed.success) {
      return { ok: false, error: 'INVALID_ACTION', reason: parsed.error.message };
    }

    let result: ActionResult<unknown>;
    try {
      result = this.logic.onAction(this.state, parsed.data, playerID, this.ctx);
    } catch (e) {
      console.error('onAction threw:', e);
      return { ok: false, error: 'ACTION_REJECTED', reason: 'Internal game logic error' };
    }

    if (!result.ok) {
      return { ok: false, error: 'ACTION_REJECTED', reason: result.reason };
    }

    this.state = result.state;
    this.lastSeq.set(playerID, actualSeq);
    this.lastActionTime.set(playerID, Date.now());
    this.lastActivityAt = Date.now();
    this.processEvents(result.events ?? []);
    this.broadcastViews();
    this.onStateChanged();

    return { ok: true, seq: actualSeq };
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
          break;
      }
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
