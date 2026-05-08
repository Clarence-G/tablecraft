import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'card-ui',
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
  },
});
