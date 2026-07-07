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
  globalSetup: './tests/e2e/global-setup.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  // detection-coverage 是重瀏覽器 spec（每筆走完整評估：問卷 + game 多回合 canvas
  // + 模組穿越）。單機同時跑太多 headless 分頁的原始 CPU 競爭會讓偶發一筆超時
  // （見 STATUS「降並發」教訓）。CI 用 1（最穩）；本機上限 2（比序列快、競爭可控）。
  workers: process.env.CI ? 1 : 2,
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
        // 平行多分頁時，Chromium 會把背景分頁的 setTimeout 節流，導致 GameModule
        // 每回合 setTimeout(advance,800) 被拖成數秒 → 整組評估逼近 test timeout。
        // 停用背景節流，讓時序敏感的模組（game/drawing/問卷回饋延遲）在並發下穩定。
        '--disable-background-timer-throttling',
        '--disable-renderer-backgrounding',
        '--disable-backgrounding-occluded-windows',
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
