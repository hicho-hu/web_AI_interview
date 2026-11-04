import { defineConfig, devices } from '@playwright/test';
const production = !!process.env.PRODUCTION_PREVIEW;
const port = production ? 4173 : Number(process.env.E2E_PORT || 5173);
const baseURL = `http://127.0.0.1:${port}`;
export default defineConfig({
  testDir: './tests/e2e',
  outputDir: production
    ? 'test-results/production'
    : process.env.LIVE_API
      ? 'test-results/live'
      : 'test-results/demo',
  timeout: 120000,
  expect: { timeout: 20000 },
  workers: 1,
  reporter: 'list',
  use: { baseURL, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    {
      name: 'chrome',
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chrome',
        launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] },
      },
    },
  ],
  webServer: {
    command: production ? 'npm run preview -- --port 4173 --strictPort' : `npm run dev -- --port ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.ISOLATED_BACKEND,
    timeout: 30000,
  },
});
