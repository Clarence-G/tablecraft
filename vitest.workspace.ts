import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  'packages/shared/vitest.config.ts',
  'packages/server/vitest.config.ts',
  'games/gomoku/vitest.config.ts',
  'games/love-letter/vitest.config.ts',
  'games/connect-four/vitest.config.ts',
  'games/liar-bar/vitest.config.ts',
  'games/yahtzee/vitest.config.ts',
  'games/hive/vitest.config.ts',
  'games/blackjack/vitest.config.ts',
  'games/uno/vitest.config.ts',
  'games/battleship/vitest.config.ts',
  'games/texas-holdem/vitest.config.ts',
  'games/_template/vitest.config.ts',
]);
