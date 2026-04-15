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
} from '@repo/shared';
import { nanoid } from 'nanoid';
import { RandomProvider } from './RandomProvider';
import { TimerManager } from './TimerManager';

type BroadcastFn = (roomId: string, playerViews: Map<string, unknown>) => void;

export class GameRoom {
  roomId: string;
  gameId: string;
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

  private broadcast: BroadcastFn | null = null;

  constructor(gameId: string, meta: GameMeta, config?: unknown, logic?: GameLogic) {
    this.roomId = nanoid(6).toUpperCase();
    this.gameId = gameId;
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

  join(playerID: string, name: string): Ack<void> {
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
      ready: false,
      connected: true,
      seatIndex,
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
      this.players.set(id, { ...player, ready: false });
    }
    this.lastActivityAt = Date.now();
  }

  toRoomState(): RoomState {
    return {
      roomId: this.roomId,
      gameId: this.gameId,
      status: this.status,
      hostId: this.hostId,
      players: [...this.players.values()],
      maxPlayers: this.ctx.players.length || this.players.size,
      config: this.config,
      createdAt: this.createdAt,
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
