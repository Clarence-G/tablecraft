import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
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
