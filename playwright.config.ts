import { defineConfig, devices } from '@playwright/test';
const production = !!process.env.PRODUCTION_PREVIEW;
const mobile = !!process.env.H5_PREVIEW;
const syntheticOSS = production && !!process.env.SYNTHETIC_OSS;
const port = production ? 4173 : Number(process.env.E2E_PORT || 5173);
const baseURL = `http://127.0.0.1:${port}`;
const applicationServer = {
  command: production ? 'npm run preview -- --port 4173 --strictPort' : `npm run dev -- --port ${port}`,
  url: baseURL,
  reuseExistingServer: !process.env.ISOLATED_BACKEND && !syntheticOSS,
  timeout: 30000,
  ...(syntheticOSS ? { env: { OSS_UPLOAD_TARGET: 'http://127.0.0.1:5198' } } : {}),
};
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: mobile ? ['mobile.spec.ts', 'conversation.spec.ts'] : undefined,
  outputDir: mobile
    ? 'test-results/mobile'
    : production
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
        ...devices[mobile ? 'Pixel 7' : 'Desktop Chrome'],
        channel: 'chrome',
        launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] },
      },
    },
  ],
  webServer: syntheticOSS
    ? [
        {
          command: 'node tests/fixtures/oss-server.mjs',
          url: 'http://127.0.0.1:5198/health',
          reuseExistingServer: false,
          timeout: 10000,
        },
        applicationServer,
      ]
    : applicationServer,
});
