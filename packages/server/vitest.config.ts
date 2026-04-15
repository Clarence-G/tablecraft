import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'server',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@repo/shared': path.resolve(__dirname, '../shared/src'),
    },
  },
});
