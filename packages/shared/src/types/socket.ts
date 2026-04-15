import type { RoomState } from './room';

/** 通用 ack 回调结果 */
export type Ack<T = void> = { ok: true; data: T } | { ok: false; error: string };

/** 客户端 → 服务端 */
export interface ClientEvents {
  'room:create': (
    gameId: string,
    playerName: string,
    config: unknown | undefined,
    ack: (result: Ack<{ roomId: string }>) => void,
  ) => void;

  'room:join': (roomId: string, playerName: string, ack: (result: Ack) => void) => void;

  'room:leave': () => void;
  'room:ready': () => void;

  'room:start': (ack: (result: Ack) => void) => void;

  'room:kick': (playerId: string) => void;

  'room:restart': () => void;

  'game:action': (action: unknown, seq: number) => void;
}

/** 服务端 → 客户端 */
export interface ServerEvents {
  'room:state': (room: RoomState) => void;
  'game:state': (view: unknown) => void;
  'game:reject': (reason: string) => void;
  'game:notify': (payload: unknown) => void;
  'game:end': (rankings: string[]) => void;
  error: (message: string) => void;
}
