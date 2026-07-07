import { test, expect, type Page } from '@playwright/test';
import { ALL_AGE_GROUPS, birthDateForAgeGroup } from './helpers/age-fixtures';
import { answerQuestionnaire } from './helpers/questionnaire-driver';
import { readLatestTriage } from './helpers/idb-reader';
import { expectedQuestionnaireZ } from './helpers/expected-norms';
import { recordCoverage, resetCoverage } from './helpers/coverage-recorder';
import { playGame, doVoice, doVideo, doDrawing } from './helpers/active-module-driver';
import { getQuestionnaireMaxScores } from '../../src/lib/questionnaire/max-scores';
import type { AgeGroupCDSA } from '../../src/lib/utils/age-groups';

/**
 * 「檢測覆蓋 E2E」主 spec — 維度①問卷段。
 *
 * 對每個 (ageGroup × domain × score) 走 profile → 問卷 → 剩餘模組 → result，
 * 斷言 IndexedDB `assessments.triageResult.details` 的 questionnaireScore z 值
 * 與 `expectedQuestionnaireZ`（ASQ-3 table 18 常模換算）一致。
 *
 * 目標 domain 取指定 score，其餘 domain 一律滿分——讓 gross_motor/fine_motor/
 * language 對應的 video/drawing/voice 模組在「其餘 domain」情境下被 store 的
 * skippedModules 邏輯自動跳過（assessment.svelte.ts:63-75），只有正在枚舉的
 * domain 若剛好對應這三個模組，才需要真的跑一次互動（分數未滿分 = 不跳過）。
 * game 模組永遠不會被跳過（不在 SkippableModule 判斷式內），一律要跑。
 */

test.beforeAll(() => resetCoverage());

async function startAssessment(page: Page, ageGroup: AgeGroupCDSA): Promise<void> {
  await page.goto('/assess/');
  await page.getByRole('heading', { name: '兒童基本資料' }).waitFor({ timeout: 15_000 });
  await page.getByLabel(/出生日期/).fill(birthDateForAgeGroup(ageGroup));
  // 冒煙時發現的真實 race：ChildProfile 的 heading 是 Astro SSR 內容，先於
  // `client:load` island 完成 hydration 就可見。若填完日期立刻點「開始評估」，
  // 有時 bind:value 事件監聽器還沒接上，click 等於點在死按鈕上，畫面停在原地
  // 卡死（在此環境下可穩定重現 3/3 次）。等待年齡徽章文字（只有 hydration 完成、
  // Svelte `$derived` 算出 ageMonths 後才會渲染）出現，證明表單已經活了，再送出。
  await page.getByText(/個月 —/).waitFor({ timeout: 10_000 });
  await page.getByRole('button', { name: '開始評估' }).click();
  await page.getByRole('progressbar').waitFor({ timeout: 10_000 });
}

/**
 * 走完問卷摘要後剩餘的模組（game 必玩、voice/video/drawing 視 skippedModules
 * 自動跳過或需要真的互動）直到 result 頁「各面向評估」出現。
 *
 * 用各模組唯一的 wrapper class 偵測目前所在模組（`.game-module` /
 * `.voice-module` / `.video-module` / `.drawing-module`），交給
 * active-module-driver 對應的 helper 跑完；若都偵測不到（例如該步驟被
 * store 的 $effect 自動 skip、瞬間跳過未渲染），就短暫等待讓狀態機前進。
 */
async function advanceToResult(page: Page): Promise<void> {
  for (let i = 0; i < 15; i++) {
    if (await page.getByRole('heading', { name: '各面向評估' }).isVisible().catch(() => false)) return;
    if (await page.locator('.game-module').isVisible().catch(() => false)) { await playGame(page); continue; }
    if (await page.locator('.voice-module').isVisible().catch(() => false)) { await doVoice(page); continue; }
    if (await page.locator('.video-module').isVisible().catch(() => false)) { await doVideo(page); continue; }
    if (await page.locator('.drawing-module').isVisible().catch(() => false)) { await doDrawing(page); continue; }
    await page.waitForTimeout(400);
  }
  await page.getByRole('heading', { name: '各面向評估' }).waitFor({ timeout: 15_000 });
}

for (const ageGroup of ALL_AGE_GROUPS) {
  const maxScores = getQuestionnaireMaxScores(ageGroup);
  const domains = Object.keys(maxScores);

  test.describe(`維度①問卷 ${ageGroup}`, () => {
    for (const domain of domains) {
      for (let score = 0; score <= maxScores[domain]; score++) {
        test(`${ageGroup} ${domain} score=${score} → z 落地正確`, async ({ page }) => {
          test.setTimeout(90_000);
          await startAssessment(page, ageGroup);
          // 目標 domain 取 score，其餘 domain 滿分（隔離）
          await answerQuestionnaire(page, ageGroup, { [domain]: score });

          await page.getByRole('button', { name: '依建議繼續' }).click();
          await advanceToResult(page);

          const triage = await readLatestTriage(page);
          expect(triage, 'triageResult 應已落地').not.toBeNull();
          const detail = triage!.details.find((d) => d.domain === domain && d.metric === 'questionnaireScore');
          expect(detail, `${domain} 應有 questionnaireScore detail`).toBeTruthy();

          const expectedZ = expectedQuestionnaireZ(domain, ageGroup, score, maxScores[domain]);
          expect(detail!.zScore).toBeCloseTo(expectedZ, 4);

          recordCoverage({ kind: 'questionnaire', domain, age: ageGroup, score });
        });
      }
    }
  });
}
