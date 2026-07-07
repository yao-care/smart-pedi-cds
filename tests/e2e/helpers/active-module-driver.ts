import type { Page } from '@playwright/test';

/**
 * 主動模組穿越 helper（維度①問卷 spec 用）。
 *
 * 設計原則（2026-07-07 穩定化重構）：
 * 1. **絕不 throw**——每個 driver 都是 best-effort 穿越，唯一的硬斷言留給
 *    advanceToResult 的 final `waitFor 各面向評估`。舊版每個 driver 結尾有一行
 *    盲點「繼續下一步」的 `.click({timeout})`，一旦模組已前進 / 負載下時序漂移
 *    就 10s 逾時整組紅——這是先前 flaky 的主因。
 * 2. **狀態驅動非固定等待**——game 等 feedback overlay 出現→消失（advance 完成）
 *    再點下一次，取代固定 900ms（並發負載下 800ms advance 會漂移）。
 * 3. **voice / video 走 skip 路徑**——headless 的 speechSynthesis / 攝影機錄製
 *    時序不可靠（TTS onend 不觸發、錄製後 ResultView 背景跑 MediaPipe 依賴 CDN）；
 *    本 spec 只需穿越模組抵達結果頁驗證問卷 z，語音 / 粗大動作的檢測落地由 unit /
 *    整合測試涵蓋（active-module-analysis / ResultView enrich）。
 */

/** 按鈕可見則點擊並回傳 true（點擊失敗吞掉，不 throw）。 */
async function clickIfVisible(page: Page, name: RegExp): Promise<boolean> {
  const btn = page.getByRole('button', { name });
  if (await btn.isVisible().catch(() => false)) {
    await btn.click().catch(() => {});
    return true;
  }
  return false;
}

/** 互動遊戲：GameModule 選項畫在 `<canvas>`（座標 hit-test，always-positive
 *  feedback——點任意位置都 showFeedback + setTimeout(advance,800)）。點中心、
 *  等本回合 feedback overlay 消失再點下一次，直到「遊戲完成！→繼續下一步」或
 *  圖卡不足的「跳過遊戲評估」。canvas 消失（已離開模組）即交還上層重判。 */
export async function playGame(page: Page): Promise<void> {
  // wall-clock 上限：避免點擊在負載下不進展時空轉到吃光整個 test budget（120s）。
  // 遊戲正常 6–10 回合、每回合 ~1s，45s 綽綽有餘；逾時則交還 advanceToResult 的
  // 硬斷言（各面向評估）給出明確結果，而非讓整個 test 因 driver 空轉而 timeout。
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (await clickIfVisible(page, /繼續下一步/)) return;
    if (await clickIfVisible(page, /跳過遊戲評估/)) return;
    const canvas = page.locator('.game-module canvas');
    if (!(await canvas.isVisible().catch(() => false))) return;
    const box = await canvas.boundingBox();
    if (box) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    // handleCanvasClick 在 showFeedback 時忽略點擊，故等 overlay 消失（advance 完成）
    // 再進下一輪；比固定等待抗並發負載。點擊被忽略時 overlay 早已隱藏，waitFor 立即
    // 返回，下一輪重點。
    await page.locator('.game-module .feedback-overlay')
      .waitFor({ state: 'hidden', timeout: 2_500 }).catch(() => {});
  }
}

/** 語音：走確定性 skip 路徑穿越（見檔頭原則 3）。 */
export async function doVoice(page: Page): Promise<void> {
  for (let i = 0; i < 15; i++) {
    if (await clickIfVisible(page, /繼續下一步/)) return;
    if (await clickIfVisible(page, /跳過語音互動/)) return;
    if (await clickIfVisible(page, /跳過此題/)) { await page.waitForTimeout(150); continue; }
    if (!(await page.locator('.voice-module').isVisible().catch(() => false))) return;
    await page.waitForTimeout(300);
  }
}

/** 影片：走確定性 skip 路徑穿越（見檔頭原則 3）。 */
export async function doVideo(page: Page): Promise<void> {
  for (let i = 0; i < 15; i++) {
    if (await clickIfVisible(page, /繼續下一步/)) return;
    if (await clickIfVisible(page, /跳過影片錄製/)) return;
    if (!(await page.locator('.video-module').isVisible().catch(() => false))) return;
    await page.waitForTimeout(300);
  }
}

/** 繪圖：對 canvas 派發指標事件畫線，逐一送出所有形狀直到「繼續下一步」。 */
export async function doDrawing(page: Page): Promise<void> {
  for (let i = 0; i < 12; i++) {
    if (await clickIfVisible(page, /繼續下一步/)) return;
    const canvas = page.locator('.drawing-module canvas');
    if (!(await canvas.isVisible().catch(() => false))) return;
    const box = await canvas.boundingBox();
    if (box) {
      await page.mouse.move(box.x + 80, box.y + 80);
      await page.mouse.down();
      await page.mouse.move(box.x + 200, box.y + 120, { steps: 8 });
      await page.mouse.move(box.x + 160, box.y + 240, { steps: 8 });
      await page.mouse.up();
    }
    if (await clickIfVisible(page, /完成此圖/)) { await page.waitForTimeout(250); continue; }
    await page.waitForTimeout(250);
  }
}
