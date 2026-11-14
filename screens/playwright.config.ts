import { defineConfig } from '@playwright/test';

/** Browser screens (ring 1): the app in fixtures mode, one test per screen × profile, output screens/out/. */
export default defineConfig({
  testDir: '.',
  testMatch: /(screens|nav|store|engine|share|crash)\.spec\.ts/,
  outputDir: '../test-results',
  timeout: 60_000,
  retries: 0,
  workers: 2,
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:4173', screenshot: 'off', trace: 'off' },
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
