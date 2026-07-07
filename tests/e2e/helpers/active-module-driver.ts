import type { Page } from '@playwright/test';

/** 互動遊戲：自動點刺激選項直到完成或跳過。GameModule 完成會 addAnalysis(behaviorMetrics)。 */
export async function playGame(page: Page): Promise<void> {
  // 遊戲每回合出現數個可點目標；點到出現「繼續下一步」為止，最多 20 回合。
  for (let i = 0; i < 20; i++) {
    const next = page.getByRole('button', { name: /繼續下一步/ });
    if (await next.isVisible().catch(() => false)) break;
    const stimulus = page.locator('[data-game-option], .stimulus-option, button.card-option').first();
    if (await stimulus.isVisible().catch(() => false)) {
      await stimulus.click();
    } else {
      // 找不到互動元件 → 用跳過鈕保流程前進
      const skip = page.getByRole('button', { name: /跳過遊戲評估/ });
      if (await skip.isVisible().catch(() => false)) { await skip.click(); break; }
    }
    await page.waitForTimeout(400);
  }
  await page.getByRole('button', { name: /繼續下一步/ }).click();
}

/** 語音：授權麥克風（fake audio）→ 播放+錄音 → 下一題，走完所有 prompt。 */
export async function doVoice(page: Page): Promise<void> {
  const allow = page.getByRole('button', { name: /允許使用麥克風/ });
  if (await allow.isVisible().catch(() => false)) await allow.click();
  for (let i = 0; i < 6; i++) {
    const done = page.getByRole('button', { name: /繼續下一步/ });
    if (await done.isVisible().catch(() => false)) break;
    const record = page.getByRole('button', { name: /播放指令 \+ 開始錄音/ });
    if (await record.isVisible().catch(() => false)) {
      await record.click();
      // 15s 自動停；提早按停止錄音縮短
      const stop = page.getByRole('button', { name: /停止錄音/ });
      await stop.click({ timeout: 20_000 }).catch(() => {});
      await page.getByRole('button', { name: /下一題/ }).click({ timeout: 5_000 }).catch(() => {});
    } else {
      break;
    }
    await page.waitForTimeout(400);
  }
  await page.getByRole('button', { name: /繼續下一步/ }).click({ timeout: 10_000 });
}

/** 影片：授權攝影機（fake）→ 錄 → 下一步。 */
export async function doVideo(page: Page): Promise<void> {
  const open = page.getByRole('button', { name: /開啟攝影機/ });
  if (await open.isVisible().catch(() => false)) await open.click();
  const rec = page.getByRole('button', { name: /開始錄製/ });
  if (await rec.isVisible().catch(() => false)) {
    await rec.click();
    await page.waitForTimeout(2_000);
    await page.getByRole('button', { name: /停止錄製/ }).click().catch(() => {});
  }
  await page.getByRole('button', { name: /繼續下一步/ }).click({ timeout: 15_000 });
}

/** 繪圖：對 canvas 派發指標事件畫線，逐一送出所有形狀。 */
export async function doDrawing(page: Page): Promise<void> {
  for (let shape = 0; shape < 5; shape++) {
    const done = page.getByRole('button', { name: /繼續下一步/ });
    if (await done.isVisible().catch(() => false)) break;
    const canvas = page.locator('canvas');
    const box = await canvas.boundingBox();
    if (box) {
      await page.mouse.move(box.x + 80, box.y + 80);
      await page.mouse.down();
      await page.mouse.move(box.x + 200, box.y + 120, { steps: 8 });
      await page.mouse.move(box.x + 160, box.y + 240, { steps: 8 });
      await page.mouse.up();
    }
    await page.getByRole('button', { name: /完成此圖/ }).click({ timeout: 5_000 });
    await page.waitForTimeout(300);
  }
  await page.getByRole('button', { name: /繼續下一步/ }).click({ timeout: 10_000 });
}
