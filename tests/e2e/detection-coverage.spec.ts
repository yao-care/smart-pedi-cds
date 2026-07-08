import { test, expect, type Page } from '@playwright/test';
import { ALL_AGE_GROUPS, birthDateForAgeGroup } from './helpers/age-fixtures';
import { answerQuestionnaire } from './helpers/questionnaire-driver';
import { readLatestTriage } from './helpers/idb-reader';
import { expectedQuestionnaireZ } from './helpers/expected-norms';
import { recordCoverage } from './helpers/coverage-recorder';
import { playGame, doVoice, doVideo, doDrawing, recordVoice, recordVideo, installMediaStubs } from './helpers/active-module-driver';
import { readMediaCounts } from './helpers/idb-reader';
import { downloadPdf, downloadJson, hasHistoryDownload } from './helpers/export-inspector';
import { expectedActiveModuleCells } from './coverage-expected';
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

// 覆蓋紀錄的一次性 reset 移到 playwright globalSetup（見 coverage-recorder 註解）；
// 這裡不再 per-worker reset，否則後啟動的 worker 會清掉先啟動 worker 的資料。

async function startAssessment(page: Page, ageGroup: AgeGroupCDSA): Promise<void> {
  // 在 goto 前裝 media stub（headless speechSynthesis 不回 onend 會讓語音模組
  // 的 playTTS 掛住；game 的 speak() 也受益）。維度①走 skip 不受影響，維度②
  // 真錄音才靠它。
  await installMediaStubs(page);
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
async function advanceToResult(page: Page, opts: { record?: boolean } = {}): Promise<void> {
  // record=true（維度②）：voice/video 走真錄製 driver；否則（維度①）走 skip。
  const voiceDriver = opts.record ? recordVoice : doVoice;
  const videoDriver = opts.record ? recordVideo : doVideo;
  for (let i = 0; i < 20; i++) {
    if (await page.getByRole('heading', { name: '各面向評估' }).isVisible().catch(() => false)) return;
    if (await page.locator('.game-module').isVisible().catch(() => false)) { await playGame(page); continue; }
    if (await page.locator('.voice-module').isVisible().catch(() => false)) { await voiceDriver(page); continue; }
    if (await page.locator('.video-module').isVisible().catch(() => false)) { await videoDriver(page); continue; }
    if (await page.locator('.drawing-module').isVisible().catch(() => false)) { await doDrawing(page); continue; }
    await page.waitForTimeout(400);
  }
  // 唯一硬斷言：結果頁「各面向評估」必須出現（ResultView 背景 enrich 可能含
  // MediaPipe，故給較寬裕的 20s）。
  await page.getByRole('heading', { name: '各面向評估' }).waitFor({ timeout: 20_000 });
}

for (const ageGroup of ALL_AGE_GROUPS) {
  const maxScores = getQuestionnaireMaxScores(ageGroup);
  const domains = Object.keys(maxScores);

  test.describe(`維度①問卷 ${ageGroup}`, () => {
    for (const domain of domains) {
      for (let score = 0; score <= maxScores[domain]; score++) {
        test(`${ageGroup} ${domain} score=${score} → z 落地正確`, async ({ page }) => {
          // 全流程（profile→問卷 N 題→game 多回合→視情況其他模組→result）在並發
          // 負載下耗時較長；120s 給足裕度（背景節流已由 launch flags 停用）。
          test.setTimeout(120_000);
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

/**
 * 維度②：主動模組媒體落地 + 接線稽核。
 *
 * 對每個年齡層跑一次「完整評估」（全 domain=0 → skippedModules 為空、所有主動
 * 模組都跑），真的錄音/錄影/繪圖，斷言 mediaFiles blob bytes>0。同時稽核接線：
 * voice→language（voiceDurationTotal 事件數學，確定性 → 硬斷言）、video→gross_motor
 * （MediaPipe on fake video，網路 + 合成畫面不確定 → soft annotation）。這一段
 * 同時端到端驗證 cb54605 的 voice/gross-motor wiring fix。
 *
 * 用 per-age（7 個測試）而非 per-(module×age)（26 個冗餘全跑）：每齡一次完整
 * 評估即涵蓋該齡所有 module 格，時間與 flaky 大幅降低。
 */
function cellsByAge(age: AgeGroupCDSA): Set<string> {
  return new Set(expectedActiveModuleCells().filter(c => c.age === age).map(c => c.module));
}

for (const ageGroup of ALL_AGE_GROUPS) {
  const modules = cellsByAge(ageGroup);

  test.describe(`維度②媒體落地 ${ageGroup}`, () => {
    test(`${ageGroup} 主動模組媒體 + 接線落地`, async ({ page }) => {
      // 完整評估：問卷 + game + voice（≥13m）+ video + drawing + result（含 MediaPipe
      // 背景 enrich）。真錄製較慢，給 150s。
      test.setTimeout(150_000);
      await startAssessment(page, ageGroup);
      const domains = Object.keys(getQuestionnaireMaxScores(ageGroup));
      await answerQuestionnaire(page, ageGroup, Object.fromEntries(domains.map(d => [d, 0])));
      await page.getByRole('button', { name: '跑完整評估' }).click();
      await advanceToResult(page, { record: true });

      // ── 媒體落地（blob bytes>0）──
      const media = await readMediaCounts(page);
      if (modules.has('voice')) {
        expect(media['voice']?.bytes ?? 0, `${ageGroup} voice 音檔應真的錄到`).toBeGreaterThan(0);
      }
      expect(media['video']?.bytes ?? 0, `${ageGroup} video 應真的錄到`).toBeGreaterThan(0);
      expect(media['drawing']?.bytes ?? 0, `${ageGroup} drawing 應存 PNG`).toBeGreaterThan(0);

      // ── 接線落地 ──
      const triage = await readLatestTriage(page);
      expect(triage, 'triageResult 應已落地').not.toBeNull();
      if (modules.has('voice')) {
        // voiceDurationTotal 由 voice_end 事件加總（確定性）→ language voiceDuration detail
        const langDetail = triage!.details.find(d => d.domain === 'language' && d.metric === 'voiceDuration');
        expect(langDetail, `${ageGroup} voice→language 接線應落地（cb54605）`).toBeTruthy();
      }
      // gross_motor 走 MediaPipe on fake video，不確定 → soft 記錄不讓測試紅
      const gmDetail = triage!.details.find(d => d.domain === 'gross_motor' && d.metric === 'poseClassification');
      test.info().annotations.push({ type: 'wiring', description: `${ageGroup} video→gross_motor:${!!gmDetail}` });

      // ── 覆蓋紀錄（該齡所有 module 格）──
      for (const m of modules) recordCoverage({ kind: 'module', module: m, age: ageGroup });
    });
  });
}

/**
 * 維度③：匯出完整性稽核（PDF / FHIR / GCM / 歷史下載 四出口是否帶媒體）。
 *
 * ⚠ 這些 annotation 記錄「四出口不帶錄製媒體」——by-design，非缺陷：
 * - 匯出僅帶 Patient ID + 數值、不含孩子語音/影片，是 CLAUDE.md 明訂隱私原則
 *   （「PDF/FHIR 報告僅使用 Patient ID」）；上傳媒體反而違反隱私設計。
 * - `history download exists:false` 指「/history/ 列表頁無下載捷徑」，非無法匯出——
 *   每筆評估的 PDF 匯出可由 history →「看詳細」→ /result/ →「下載 PDF 報告」取得。
 * 故本段以 annotation 客觀記錄現況、不因此讓測試紅。GCM/FHIR 上傳點下去會跳 OAuth
 * 授權 redirect（導航離開），故只驗 UI 存在、不真觸發；PDF 走真實下載事件。
 *
 * 用全 domain 滿分 → 主動模組自動 skip（只跑 game）→ 快速抵達結果頁。
 */
test.describe('維度③匯出完整性', () => {
  test('PDF / FHIR / GCM / 歷史 四出口媒體稽核', async ({ page }) => {
    test.setTimeout(120_000);
    const age: AgeGroupCDSA = '25-36m';
    await startAssessment(page, age);
    const domains = getQuestionnaireMaxScores(age);
    await answerQuestionnaire(page, age, { ...domains }); // 全滿分 → 模組 skip
    await page.getByRole('button', { name: '依建議繼續' }).click();
    await advanceToResult(page);

    // PDF 出口：真實下載，斷言能產生（bytes>0）。是否「帶錄製媒體」不以 byte 搜尋
    // 判斷——壓縮 PDF 串流 + CJK 字型二進位會讓任何位元組標記（'audio'/'Media'/
    // '/Image'）誤中，全是假陽性。答案由程式碼事實回答：AssessmentPdfReport 只
    // drawLine 文字/數值、無 addImage/音檔 → 結構上不含錄製媒體。annotation 只記
    // 客觀的下載大小。
    const pdf = await downloadPdf(page, async () => {
      await page.getByRole('button', { name: /下載 PDF 報告/ }).click();
    }).catch(() => Buffer.alloc(0));
    expect(pdf.length, 'PDF 應能產生下載').toBeGreaterThan(0);
    test.info().annotations.push({ type: 'export', description: `PDF bytes:${pdf.length}（文字報告，無內嵌錄製媒體）` });

    // GCM / FHIR 上傳出口存在性（不觸發 OAuth）
    const gcmUi = await page.getByRole('button', { name: /上傳到 GCM 收案/ }).isVisible().catch(() => false);
    const fhirUi = await page.getByRole('button', { name: /上傳|送出.*FHIR|FHIR/ }).first().isVisible().catch(() => false);
    test.info().annotations.push({ type: 'export', description: `GCM upload UI:${gcmUi} FHIR upload UI:${fhirUi}` });

    // 歷史頁下載出口
    const histDl = await hasHistoryDownload(page);
    test.info().annotations.push({ type: 'export', description: `history download exists:${histDl}` });
  });
});

/**
 * A4（B3 匯出自動化 smoke，2026-07-08）：/history/「⤓ 匯出資料（JSON）」端到端。
 *
 * 先 seed 一次真實評估（全 domain 滿分 → 只跑 game，最快抵達 result、寫入 IDB
 * children + assessments），再導到 /history/ 點匯出鈕，攔截 download 事件，硬斷言：
 *   1. 檔名符 `smart-pedi-history-YYYY-MM-DD.json`（historyExportFilename 契約）
 *   2. 內容 JSON parse 後 format='smart-pedi-history'、version=1、children[] 為陣列
 *      且首位 child 帶 assessments 陣列（buildHistoryExport 契約）。
 * 這一項綠 = B3 完全關閉，無殘留手動 smoke。
 */
test.describe('A4 匯出資料（JSON）', () => {
  test('/history/ 匯出 JSON：檔名 + 結構契約', async ({ page }) => {
    test.setTimeout(120_000);
    const age: AgeGroupCDSA = '25-36m';
    await startAssessment(page, age);
    const domains = getQuestionnaireMaxScores(age);
    await answerQuestionnaire(page, age, { ...domains }); // 全滿分 → 模組 skip，快速完成
    await page.getByRole('button', { name: '依建議繼續' }).click();
    await advanceToResult(page);

    await page.goto('/history/');
    // 匯出鈕只在有資料時渲染（childrenData.length !== 0）；剛完成的評估已寫入 IDB
    const exportBtn = page.getByRole('button', { name: /匯出資料（JSON）/ });
    await exportBtn.waitFor({ timeout: 15_000 });

    const { filename, json } = await downloadJson(page, async () => {
      await exportBtn.click();
    });

    expect(filename, '檔名應符 historyExportFilename 契約')
      .toMatch(/^smart-pedi-history-\d{4}-\d{2}-\d{2}\.json$/);

    const payload = json as {
      format?: string; version?: number;
      children?: { assessments?: unknown[] }[];
    };
    expect(payload.format, 'format 應為 smart-pedi-history').toBe('smart-pedi-history');
    expect(payload.version, 'version 應為 1').toBe(1);
    expect(Array.isArray(payload.children), 'children 應為陣列').toBe(true);
    expect(payload.children!.length, '應至少含剛 seed 的一名 child').toBeGreaterThan(0);
    expect(Array.isArray(payload.children![0].assessments), 'child 應帶 assessments 陣列').toBe(true);
    expect(payload.children![0].assessments!.length, '該 child 應至少一筆評估').toBeGreaterThan(0);
  });
});

/**
 * B1（gross-motor 暖啟 + timeout 落地硬覆蓋，2026-07-08）＋ B2 self-host 活體驗證。
 *
 * 維度②只 soft-annotate gross_motor（MediaPipe on fake video 偵測結果不確定）。這裡
 * 把「不依賴 GPU 時序」的部分硬化：
 *   1. 供應鏈守門（硬）：整個評估流程中，任何 MediaPipe 資產（wasm / pose 模型）的
 *      網路請求都不得走外部 host（jsdelivr / googleapis / 跨 origin）——B2 self-host
 *      的活體回歸守門。gross-motor-cdn-pinning.test.ts 守 URL 常數，這裡守實際網路。
 *   2. 落地不 hang（硬）：結果頁「各面向評估」必須出現、triageResult 必落地——證明
 *      gross-motor 背景 enrich 在 GROSS_MOTOR_TIMEOUT_MS 內以結果或 null 收斂，不會
 *      讓結果頁 spinner 卡死（B1 的核心風險）。
 * 偵測結果本身（poseClassification detail 是否出現）仍 soft-annotate。
 * 殘餘（交用戶）：真實裝置目視 gross_motor detail + spinner <3s，見計畫 B1。
 */
test.describe('B1 gross-motor self-host + timeout 落地', () => {
  test('25-36m：資產自本站載入、結果頁在 timeout budget 內收斂', async ({ page }) => {
    test.setTimeout(150_000);
    const age: AgeGroupCDSA = '25-36m';

    const MP_ASSET = /pose_landmarker|mediapipe-wasm|vision_wasm|tasks-vision/i;
    const externalMpReqs: string[] = [];
    const localMpReqs: string[] = [];
    page.on('request', (req) => {
      const url = req.url();
      if (!MP_ASSET.test(url)) return;
      let sameOrigin = false;
      try { sameOrigin = new URL(url).origin === new URL(page.url()).origin; } catch { /* 相對 URL */ }
      if (url.startsWith('/') || sameOrigin) localMpReqs.push(url);
      else externalMpReqs.push(url);
    });

    await startAssessment(page, age);
    const domains = Object.keys(getQuestionnaireMaxScores(age));
    await answerQuestionnaire(page, age, Object.fromEntries(domains.map((d) => [d, 0])));
    await page.getByRole('button', { name: '跑完整評估' }).click();
    await advanceToResult(page, { record: true }); // 硬等「各面向評估」（含 MediaPipe 背景 enrich）

    // ── 供應鏈守門（硬）：MediaPipe 資產不得走外部 host ──
    expect(externalMpReqs, `gross-motor 資產不得走外部 CDN：${externalMpReqs.join(', ')}`).toEqual([]);

    // ── 落地不 hang（硬）：triageResult 必落地（pipeline 以結果或 null 收斂）──
    const triage = await readLatestTriage(page);
    expect(triage, 'gross-motor enrich 後 triageResult 應落地（未卡死）').not.toBeNull();

    // ── soft：本站資產是否真被抓、pose 偵測是否落地（依裝置/GPU 而定）──
    const gmDetail = triage!.details.find((d) => d.domain === 'gross_motor' && d.metric === 'poseClassification');
    test.info().annotations.push({
      type: 'gross-motor',
      description: `local MP asset reqs:${localMpReqs.length} pose detail landed:${!!gmDetail}`,
    });
  });
});
