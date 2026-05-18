import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config — runs E2E tests against the built site via `pnpm preview`.
 *
 * Important:
 * - testDir is `./tests/e2e` so Vitest unit tests (`*.test.ts` under tests/)
 *   are not picked up; Playwright matches `*.spec.ts` here.
 * - webServer auto-spins up `pnpm preview` on 4321. CI passes; local re-uses
 *   any already-running server to avoid clobbering an open dev session.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4321',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'pnpm preview --port 4321',
    url: 'http://localhost:4321',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
