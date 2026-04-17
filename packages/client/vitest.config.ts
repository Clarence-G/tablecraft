import path from 'node:path';
import { defineConfig } from 'vitest/config';

const root = path.resolve(__dirname, '../..');

export default defineConfig({
  test: {
    name: 'client',
    include: ['src/**/*.test.{ts,tsx}'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@repo/shared': path.resolve(root, 'packages/shared/src'),
      '@repo/game-ui': path.resolve(root, 'packages/game-ui/src'),
    },
  },
});
