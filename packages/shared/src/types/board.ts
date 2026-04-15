import type { PlayerInfo } from './room';

/** Board 组件 Props */
export interface BoardProps<TView, TAction = unknown> {
  state: TView;
  myId: string;
  players: PlayerInfo[];
  sendAction: (action: TAction) => void;
  lastReject: string | null;
  notifications: unknown[];
  onReturnToRoom?: () => void;
  onReturnToLobby?: () => void;
}
