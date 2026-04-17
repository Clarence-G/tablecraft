import path from 'node:path';
import { defineConfig } from 'vitest/config';

const root = path.resolve(__dirname, '../..');

export default defineConfig({
  test: {
    name: 'game-ui',
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
  },
  resolve: {
    alias: {
      '@repo/shared': path.resolve(root, 'packages/shared/src'),
    },
  },
});
