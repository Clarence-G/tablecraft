import type { RoomState, RoomSummary } from './room';

/** 通用 ack 回调结果 */
export type Ack<T = void> = { ok: true; data: T } | { ok: false; error: string };

/** 房间内聊天消息 */
export interface ChatMessage {
  id: string;
  from: string; // userId
  fromName: string;
  text: string;
  at: number; // Date.now()
}

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

  'room:list': (gameId: string, ack: (rooms: RoomSummary[]) => void) => void;

  'chat:send': (text: string) => void;
}

/** 服务端 → 客户端 */
export interface ServerEvents {
  'room:state': (room: RoomState) => void;
  /**
   * Sent to a socket after it leaves or is kicked from a room. Signals the
   * client to drop any cached room state so lobby navigation doesn't bounce
   * the user back into the room they just left.
   */
  'room:left': () => void;
  'game:state': (view: unknown) => void;
  'game:reject': (reason: string) => void;
  'game:notify': (payload: unknown) => void;
  'game:end': (rankings: string[]) => void;
  'chat:message': (msg: ChatMessage) => void;
  'chat:history': (msgs: ChatMessage[]) => void;
  'chat:blocked': (payload: { reason: string | undefined }) => void;
  /**
   * Notifies lobby viewers that the waiting-room list has changed
   * (create/join/leave/status-change). Payload is empty; clients should
   * refetch `room:list`. Broadcast to all sockets so any mounted lobby view
   * updates reactively.
   */
  'rooms:updated': () => void;
  error: (message: string) => void;
}
