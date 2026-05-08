import type { PlayerInfo } from './room';

/** Board 组件 Props — chrome props (back/exit) are owned by the layout. */
export interface BoardProps<TView, TAction = unknown> {
  state: TView;
  myId: string;
  players: PlayerInfo[];
  /**
   * Submit an action. Pass an optional `optimisticView` to render the predicted
   * next state immediately; it is cleared on `game:state`, `game:reject`, or
   * send-timeout. Boards should only pass this when the action's effect on the
   * view is unambiguous and cheap to mispredict.
   */
  sendAction: (action: TAction, optimisticView?: TView) => void;
  /** True while an action is in flight (awaiting server ack). Board UI should disable input. */
  isSending: boolean;
  lastReject: string | null;
  notifications: unknown[];
  /** True when this socket is a spectator, not a seated player. Interactive controls should be hidden. */
  isSpectator?: boolean;
  /**
   * Per-player points delta for the just-finished match, populated from the
   * `game:over` server event. Undefined until the match ends.
   */
  pointsDelta?: Record<string, number>;
  /** Restart the match with the same players, maxPlayers, and config (host-only on the server). */
  onReturnToRoom?: () => void;
  /** Leave the room and navigate back to the lobby. */
  onReturnToLobby?: () => void;
}
