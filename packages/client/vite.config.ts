import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const root = path.resolve(__dirname, '../..');

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      { find: /^@\//, replacement: path.resolve(__dirname, 'src') + '/' },
      { find: '@repo/shared', replacement: path.resolve(__dirname, '../shared/src') },
      { find: '@repo/game-ui', replacement: path.resolve(__dirname, '../game-ui/src') },
      { find: '@games/gomoku/shared', replacement: path.resolve(root, 'games/gomoku/shared.ts') },
      {
        find: '@games/connect-four/shared',
        replacement: path.resolve(root, 'games/connect-four/shared.ts'),
      },
      { find: '@games/gomoku/board', replacement: path.resolve(root, 'games/gomoku/Board.tsx') },
      {
        find: '@games/love-letter/shared',
        replacement: path.resolve(root, 'games/love-letter/shared.ts'),
      },
      {
        find: '@games/liar-bar/shared',
        replacement: path.resolve(root, 'games/liar-bar/shared.ts'),
      },
      {
        find: '@games/yahtzee/shared',
        replacement: path.resolve(root, 'games/yahtzee/shared.ts'),
      },
      {
        find: '@games/hive/shared',
        replacement: path.resolve(root, 'games/hive/shared.ts'),
      },
      {
        find: '@games/blackjack/shared',
        replacement: path.resolve(root, 'games/blackjack/shared.ts'),
      },
      {
        find: '@games/uno/shared',
        replacement: path.resolve(root, 'games/uno/shared.ts'),
      },
      { find: /^@games\/(.+)\/board$/, replacement: path.resolve(root, 'games/$1/Board.tsx') },
    ],
  },
  server: {
    port: 5173,
    proxy: {
      '/socket.io': {
        target: 'http://localhost:3001',
        ws: true,
      },
    },
  },
  optimizeDeps: {
    include: ['framer-motion', 'socket.io-client', 'nanoid'],
  },
});
