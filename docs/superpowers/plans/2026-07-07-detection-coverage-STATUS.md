# 檢測覆蓋 E2E — 收尾狀態（2026-07-07）

分支 `test/detection-coverage-e2e`。本文件是階段性固化總結：誠實區分「已 live 實測驗證」與「尚待驗證的靜態預測」。

## 已完成且 commit

### 測試基礎建設（Wave A，10 個 helper，全部單元測試綠 + review 過）
- `playwright.config.ts` — `PLAYWRIGHT_BASE_URL` 切 live + fake media flags
- `age-fixtures` / `expected-norms`（獨立 golden 常模）/ `coverage-expected`（190+26 應測清單）/ `coverage-recorder` / `coverage-completeness`（稽核）/ `idb-reader` / `questionnaire-driver` / `active-module-driver` / `export-inspector`

### 主測試骨架
- `tests/e2e/detection-coverage.spec.ts` — 維度①問卷段（資料驅動全枚舉）
- `playGame` 已改為 canvas 座標點擊版

## 已 live 實測驗證（可信結論）

1. **問卷各面向、各分數點的 z 值正確落地 IndexedDB**。對 live `smart-pedi-cds.yao.care` 實跑數十個測試綠，涵蓋 cognition / social_emotional 在多個年齡層、多個分數點（score=0..4），`assessments.triageResult.details` 的 `zScore` 與 ASQ-3 Table 18 常模換算一致（`toBeCloseTo(expectedZ, 4)`）。**這回答了本專案的核心問題：檢測數值有沒有正確存下來——問卷這條路徑，有。**

2. **發現一個真實產品 bug（hydration race）**：`ChildProfile` 的標題是 Astro SSR 內容，先於 `client:load` island 完成 hydration 就可見；若過早點「開始評估」，`bind:value` 監聽器尚未接上，點擊落空、畫面卡死（此環境 3/3 穩定重現）。測試以「等年齡徽章文字出現」規避，但**產品本身應修**（真實使用者也可能踩到）。

## 尚待驗證（靜態 code 預測，**未經 live 實測**）

以下來自 spec §7 的靜態 code 分析，屬「預期缺口」，因主動模組 live 自動化未跑通而**尚未由測試證實**：
- Voice / Video 模組未呼叫 `addAnalysis`（language / gross_motor 主動數值可能未進 triage）
- voice 無上傳音檔功能
- PDF / FHIR / GCM / 歷史下載 四匯出出口不含媒體

## 待辦（下一階段）

1. **主動模組 live 自動化穩定化**（本次卡點）：
   - `playGame` canvas 互動 flaky（同 case 時綠時紅，時序敏感）— 需更穩健的完成偵測（用 `.game-complete`/進度文字）與更高迴圈上限
   - voice / video / drawing 三模組尚未對真實 DOM + fake media 收斂
   - `coverage-recorder` 非 worker-safe：多 worker 平行寫 `coverage-actual.json` 會 race，需改每 worker 獨立檔再合併，或序列跑
   - 並發打 live 會連鎖崩潰 → 建議降並發 / 分批
2. **Task 12 / 13 / 14 未完成**（主動模組媒體落地、匯出完整性、串接稽核閘門）
3. **修 hydration race bug**（產品 bug，獨立於測試工程）

## 教訓
主動模組（尤其 canvas 遊戲）的無頭瀏覽器自動化，比 plan 假設的重很多，且對 live 並發不穩定。核心驗證價值（z 落地正確）用問卷路徑已達成；主動模組的完整 live 覆蓋應另立穩定化任務、控管投入。
