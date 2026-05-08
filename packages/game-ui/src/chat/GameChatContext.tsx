import type { ChatMessage, PlayerInfo } from '@repo/shared';
import { type ReactNode, createContext, useContext } from 'react';

export interface GameChatContextValue {
  messages: ChatMessage[];
  send: (text: string) => void;
  myId: string;
  players?: readonly PlayerInfo[];
}

const GameChatContext = createContext<GameChatContextValue | null>(null);

export function GameChatProvider({
  value,
  children,
}: {
  value: GameChatContextValue;
  children: ReactNode;
}) {
  return <GameChatContext.Provider value={value}>{children}</GameChatContext.Provider>;
}

export function useGameChat(): GameChatContextValue {
  const ctx = useContext(GameChatContext);
  if (!ctx) {
    return {
      messages: [],
      send: () => {},
      myId: '',
      players: [],
    };
  }
  return ctx;
}
