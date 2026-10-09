import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:8788',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  ...(process.env.PLAYWRIGHT_BASE_URL
    ? {}
    : {
        webServer: {
          // Pin the port: bare `wrangler dev` listens on 8787, not the 8788 waited on below.
          command: 'npm run build && npx wrangler dev --ip 127.0.0.1 --port 8788',
          url: 'http://127.0.0.1:8788',
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
      }),
});
