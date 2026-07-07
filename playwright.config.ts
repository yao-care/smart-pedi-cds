import { defineConfig, devices } from '@playwright/test';

const liveBase = process.env.PLAYWRIGHT_BASE_URL;

/**
 * Playwright config — runs E2E tests against the built site via `pnpm preview`,
 * or against live when PLAYWRIGHT_BASE_URL is set.
 *
 * Important:
 * - testDir is `./tests/e2e` so Vitest unit tests (`*.test.ts` under tests/)
 *   are not picked up; Playwright matches `*.spec.ts` here.
 * - When PLAYWRIGHT_BASE_URL is set, webServer is disabled (targets live site).
 * - Otherwise, webServer auto-spins up `pnpm preview` on 4321. CI passes; local re-uses
 *   any already-running server to avoid clobbering an open dev session.
 * - Fake media launch flags enable getUserMedia() without permission prompts.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'list',
  use: {
    baseURL: liveBase ?? 'http://localhost:4321',
    trace: 'retain-on-failure',
    // fake 麥克風/攝影機：讓 getUserMedia 不跳權限、可餵測試音檔
    launchOptions: {
      args: [
        '--use-fake-device-for-media-stream',
        '--use-fake-ui-for-media-stream',
        '--use-file-for-fake-audio-capture=tests/e2e/fixtures/fake-voice.wav',
      ],
    },
  },
  webServer: liveBase
    ? undefined
    : {
        command: 'pnpm preview --port 4321',
        url: 'http://localhost:4321',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
