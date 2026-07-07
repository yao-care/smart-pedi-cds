import type { Page } from '@playwright/test';

/** 互動遊戲：GameModule 的選項畫在 `<canvas>` 上（座標 hit-test），且採
 *  always-positive feedback——點 canvas 任意位置都會 advance（handleCanvasClick
 *  不論命中與否都 showFeedback + setTimeout(advance,800)）。故點 canvas 中心、
 *  等 feedback+advance（~900ms）、重複到「遊戲完成！」出現即可。圖卡不足時走
 *  「跳過遊戲評估」。完成後點「繼續下一步」才 finishAndContinue → addAnalysis。 */
export async function playGame(page: Page): Promise<void> {
  for (let i = 0; i < 40; i++) {
    const next = page.getByRole('button', { name: /繼續下一步/ });
    if (await next.isVisible().catch(() => false)) { await next.click(); return; }
    const skip = page.getByRole('button', { name: /跳過遊戲評估/ });
    if (await skip.isVisible().catch(() => false)) { await skip.click(); return; }
    const canvas = page.locator('.game-module canvas');
    if (await canvas.isVisible().catch(() => false)) {
      const box = await canvas.boundingBox();
      if (box) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(900); // 800ms feedback + advance
      continue;
    }
    await page.waitForTimeout(400);
  }
  await page.getByRole('button', { name: /繼續下一步/ }).click({ timeout: 10_000 });
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
