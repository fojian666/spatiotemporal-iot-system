import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 45000,
  expect: { timeout: 10000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    browserName: 'chromium',
    viewport: { width: 1440, height: 1000 },
    locale: 'zh-CN', timezoneId: 'Asia/Shanghai',
    trace: 'retain-on-failure', screenshot: 'only-on-failure',
    launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
  },
  webServer: [
    { command: 'node scripts/test-api-server.mjs', url: 'http://127.0.0.1:8020/api/health', reuseExistingServer: false, timeout: 90000 },
    { command: 'node scripts/test-web-server.mjs local', url: 'http://127.0.0.1:4175', reuseExistingServer: false, timeout: 120000,
      env: { VITE_DATA_SOURCE: 'local', VITE_API_BASE_URL: 'http://127.0.0.1:8020' } },
    { command: 'node scripts/test-web-server.mjs api', url: 'http://127.0.0.1:4176', reuseExistingServer: false, timeout: 120000,
      env: { VITE_DATA_SOURCE: 'api', VITE_API_BASE_URL: 'http://127.0.0.1:8020' } },
  ],
});
