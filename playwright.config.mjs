import { defineConfig } from '@playwright/test';

const testPort = Number(process.env.TEST_SERVER_PORT || 4173);

export default defineConfig({
  testDir: './tests/ui',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://127.0.0.1:${testPort}`,
    browserName: 'chromium',
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  webServer: {
    command: 'node tools/static-server.mjs',
    url: `http://127.0.0.1:${testPort}/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000
  }
});
