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

## 待辦（下一階段）—— 已於 2026-07-08 全數完成

1. ~~**主動模組 live 自動化穩定化**~~ ✅（commit `9ad3791`）：
   - `playGame` 改「等 feedback overlay 消失同步 + 45s wall-clock 上限」，不再固定等待。
   - driver 全部改狀態驅動、**絕不 throw**（移除結尾盲點 click——先前 flaky 主因）；voice/video 維度①走確定性 skip、維度②走真錄製。
   - `coverage-recorder` 改「每 worker NDJSON shard + appendFileSync」worker-safe，一次性 reset 移到 `global-setup.ts`。
   - 並發：Chromium 停背景節流 flags + timeout 120s + 本機 workers 上限 2（CI 1）。
2. ~~**Task 12 / 13 / 14**~~ ✅（commit `387a399`）：
   - Task 12 維度②媒體落地：破解 headless TTS 掛住的 linchpin（`installMediaStubs`），voice/video/drawing 真錄 blob>0，**voice→language 接線硬斷言端到端驗證 cb54605**。
   - Task 13 維度③匯出完整性稽核（PDF 真下載 + GCM/FHIR/歷史出口 annotation）。
   - Task 14 `test:detection` / `test:coverage-audit` scripts + `tests/e2e/README.md`。
3. ~~**修 hydration race bug**~~ ✅（commit `2ff6dba`）。

**額外**：voice/gross-motor wiring gap（原「預期缺口」）也已修（commit `cb54605`）——分析函式接進 live triage 而非只掛 dead code。

## 最終驗證（實際 config workers=2 + retries=1）
- full 198（維度①190 + ②7 + ③1）→ **195 passed + 3 flaky（retry 過）+ 0 failed，exit 0**。
- `pnpm test:coverage-audit` → **涵蓋率 100%、漏測 0、逾測 0**（全 7 齡 ✓）。
- unit 697 綠。3 筆 flaky 為單機長跑資源競爭，非邏輯；workers=1 全淨。

## 教訓（修正）
主動模組無頭自動化確實比 plan 假設重，但**並非不可行**：voice 的卡點是 headless speechSynthesis 不回 onend（stub 即解），video/drawing 的 fake media 本就可用。真正需控管的是「單機高並發長跑的資源競爭」——用 workers 上限 + retries 處理，非降低覆蓋。
