import type { ChatMessage } from '@repo/shared';
import { type ReactNode, createContext, useContext } from 'react';

export interface GameChatContextValue {
  messages: ChatMessage[];
  send: (text: string) => void;
  myId: string;
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
    // Graceful fallback so the side panel renders an empty/disabled chat if no
    // provider is mounted (e.g. unit tests).
    return {
      messages: [],
      send: () => {},
      myId: '',
    };
  }
  return ctx;
}
