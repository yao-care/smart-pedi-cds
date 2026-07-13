import { test, expect, type Page } from '@playwright/test';
import { birthDateForAgeGroup } from './helpers/age-fixtures';
import { answerQuestionnaire } from './helpers/questionnaire-driver';
import { playGame, doVoice, doVideo, doDrawing, installMediaStubs } from './helpers/active-module-driver';

/**
 * Live 冒煙：驗證 age-band 紅旗安全網在結果頁真的 render。
 * 25-36m 孩子 gross_motor 全 0（gm-03「還需要扶著」）→ not-walking 紅旗 → refer，
 * 結果頁應出現 danger 色「需要特別留意」區塊與紅旗條目。
 */

async function startAssessment(page: Page): Promise<void> {
  await installMediaStubs(page);
  await page.goto('/assess/');
  await page.getByRole('heading', { name: '兒童基本資料' }).waitFor({ timeout: 15_000 });
  await page.getByLabel(/出生日期/).fill(birthDateForAgeGroup('25-36m'));
  await page.getByText(/個月 —/).waitFor({ timeout: 10_000 });
  await page.getByRole('button', { name: '開始評估' }).click();
  await page.getByRole('progressbar').waitFor({ timeout: 10_000 });
}

async function advanceToResult(page: Page): Promise<void> {
  for (let i = 0; i < 20; i++) {
    if (await page.getByRole('heading', { name: '各面向評估' }).isVisible().catch(() => false)) return;
    if (await page.locator('.game-module').isVisible().catch(() => false)) { await playGame(page); continue; }
    if (await page.locator('.voice-module').isVisible().catch(() => false)) { await doVoice(page); continue; }
    if (await page.locator('.video-module').isVisible().catch(() => false)) { await doVideo(page); continue; }
    if (await page.locator('.drawing-module').isVisible().catch(() => false)) { await doDrawing(page); continue; }
    await page.waitForTimeout(400);
  }
  await page.getByRole('heading', { name: '各面向評估' }).waitFor({ timeout: 20_000 });
}

test('red flag block renders on result page (not-walking, 25-36m)', async ({ page }) => {
  test.setTimeout(120_000);
  await startAssessment(page);
  await answerQuestionnaire(page, '25-36m', { gross_motor: 0 });
  await page.getByRole('button', { name: '依建議繼續' }).click();
  await advanceToResult(page);

  // 紅旗警訊區塊
  const redFlagBlock = page.locator('.red-flags');
  await expect(redFlagBlock).toBeVisible();
  await expect(redFlagBlock.getByRole('heading', { name: '需要特別留意' })).toBeVisible();
  await expect(redFlagBlock).toContainText('兩歲後仍不會自己走路');
  // 分流卡應為建議轉介
  await expect(page.getByRole('heading', { level: 2, name: '建議轉介' })).toBeVisible();

  await page.screenshot({ path: 'test-results/red-flag-live.png', fullPage: true });
});
