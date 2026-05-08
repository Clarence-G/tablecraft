import { useContext } from 'react';
import { GameLogContext, type GameLogContextValue } from './GameLogContext';

const NOOP: GameLogContextValue = {
  entries: [],
  push: () => {},
  ingestNotifications: () => {},
  clear: () => {},
  playerNames: {},
  players: [],
};

export function useGameLog(): GameLogContextValue {
  const ctx = useContext(GameLogContext);
  return ctx ?? NOOP;
}
