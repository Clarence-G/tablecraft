import path from 'node:path';
import { defineConfig } from 'vitest/config';

const root = path.resolve(__dirname, '..');

export default defineConfig({
  test: {
    name: 'scripts',
    include: ['*.test.ts'],
  },
  resolve: {
    alias: {
      '@repo/shared': path.resolve(root, 'packages/shared/src'),
    },
  },
});
