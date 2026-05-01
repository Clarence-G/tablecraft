import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  // Only pick up *.spec.ts files — exclude vitest helpers.test.ts and configs
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  // Keep at 1 until per-worker DB isolation is implemented in Stage 3.
  // Parallel workers require each worker to have its own DB + server instance.
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    headless: true,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // In CI: start both servers. Locally: assume they're running.
  webServer: process.env.CI
    ? [
        {
          command: 'pnpm --filter @repo/server dev',
          url: 'http://localhost:3001/socket.io/?EIO=4&transport=polling',
          reuseExistingServer: false,
          timeout: 30000,
        },
        {
          command: 'pnpm --filter @repo/client dev',
          url: 'http://localhost:5173',
          reuseExistingServer: false,
          timeout: 30000,
        },
      ]
    : undefined,
});
