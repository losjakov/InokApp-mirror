import { defineConfig } from '@playwright/test';

/** Browser screens (ring 1): the app in fixtures mode, one test per screen × profile, output screens/out/. */
export default defineConfig({
  testDir: '.',
  testMatch: /(screens|nav|store|engine|share|crash)\.spec\.ts/,
  timeout: 60_000,
  retries: 0,
  workers: 2,
  reporter: [['list']],
  // cloud_37 (A-121): PW_ENGINE=webkit runs the same screens on WebKit (the iPhone's engine); default Chromium (the Android WebView's)
  use: { baseURL: 'http://127.0.0.1:4173', screenshot: 'off', trace: 'off', browserName: process.env.PW_ENGINE === 'webkit' ? 'webkit' : 'chromium' },
  outputDir: process.env.PW_ENGINE === 'webkit' ? '../test-results-webkit' : '../test-results',
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
