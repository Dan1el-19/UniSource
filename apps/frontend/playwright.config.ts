import { defineConfig, devices } from '@playwright/test';

const host = '127.0.0.1';
const port = 4321;
const apiPort = 46789;
const baseURL = `http://${host}:${port}`;
const apiBaseUrl = `http://${host}:${apiPort}`;

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['list']] : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: `powershell -NoProfile -Command "$env:PUBLIC_API_URL='${apiBaseUrl}'; $env:PUBLIC_SERVICE_ID='usrc'; $env:PUBLIC_APPWRITE_ENDPOINT='https://mocked.appwrite.test/v1'; $env:PUBLIC_APPWRITE_PROJECT='mocked-project'; pnpm dev --host ${host} --port ${port}"`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],
});
