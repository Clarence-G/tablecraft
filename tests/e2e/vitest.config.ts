import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'e2e-helpers',
    include: ['helpers/*.test.ts'],
    environment: 'node',
    globals: false,
  },
});
