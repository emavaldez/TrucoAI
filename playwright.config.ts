import { defineConfig } from '@playwright/test';

/**
 * E2E de TrucoAI (historia 0-2).
 *
 * `baseURL` usa 127.0.0.1 y no `localhost`: en macOS `localhost` resuelve
 * primero a `::1` y `vite preview` escucha en IPv4 (ver `vite.config.ts`).
 */
export default defineConfig({
  testDir: 'e2e',
  retries: 0,
  workers: 3,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium', viewport: { width: 1280, height: 800 } },
    },
  ],
  webServer: {
    command: 'npm run build && npx vite preview --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
