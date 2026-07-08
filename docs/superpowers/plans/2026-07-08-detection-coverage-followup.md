# 檢測覆蓋 E2E — 測試照出的問題 / 後續工作列表（2026-07-08）

這份是「測試 + 診斷照出的問題」清單，供 /clear 後續作。分三類：**已修待驗**、
**待決策**、**交付**。每項附驗收條件。

前置事實：本次 8 個 commit 皆**本地、未 push**（`2ff6dba`..`ce28cbf`，見 git log
`7e50be1..HEAD`）。單元 698 綠、E2E 204（維度①190/②7/③1）、coverage-audit 100%。

---

## A. 已修，但需真實裝置驗證

### A1. gross_motor pose 訊號真實落地 —（已修 `ddf5499`，未在真實裝置驗）
- **問題**：MediaPipe 冷啟（下載 WASM+模型+編譯+首推論）本機軟體 GPU ~38-52s，
  被原 10s timeout 切斷回 null → 使用者第一次評估時粗大動作 CV 檢測靜默失效。
- **已做**：VideoModule 掛載時 `warmUpGrossMotor()` 預熱；快取 FilesetResolver；
  修 ResultView `$effect` 雙跑；timeout 10s→15s。本機以「兩次評估暖啟」間接驗過
  （cold=false / warm=true）。
- **待驗**：push 後在**真實裝置（硬體 GPU、真鏡頭、正常網路）**實跑一次完整評估，
  確認：(1) 首次評估 pose 是否在 15s 內落地（預熱是否來得及），(2) 結果頁不會
  長時間空轉。
- **若不過**：預熱提前到更早步驟 / 改 async enrich（結果頁先出、pose 後補）/
  調 timeout。
- **驗收**：真實裝置首次評估，triage 出現 `gross_motor / poseClassification` detail，
  且結果頁 spinner < ~3s。

---

## B. 待決策（產品 / ML，非測試工程）

### B1. gross_motor pose 分類器是「佔位啟發式」，且會稀釋問卷訊號
- **問題**：`analyzeGrossMotor`（gross-motor-analysis.ts）自己註解「In production,
  this would use an ONNX model trained on clinical data」——目前是門檻式啟發式，
  非臨床模型。且它以 z 進 triage 的 per-domain 平均：實測問卷 z=-6.15（嚴重）+
  pose z=0（'normal'）→ 平均 -3.08，把真正的問卷警示往「正常」拉。
- **選項**：(a) 訓練 / 接臨床 ONNX 模型；(b) pose 改 **display-only**、不進 triage
  gating（問卷為粗大動作的可靠來源）；(c) 維持現狀。
- **驗收**：決定並落實其一；若 (b)，triage.ts 移除 gross_motor poseClassification
  進 domainZ 合成，並補測試。

### B2. MediaPipe 用未釘版的 `@latest` CDN URL（可靠性 / 供應鏈 / 隱私）
- **問題**：`gross-motor-analysis.ts` 載入
  `@mediapipe/tasks-vision@latest/wasm` 與
  `.../pose_landmarker_lite/float16/latest/pose_landmarker_lite.task`——兩者皆
  `latest`，上游更新可能無預警破壞；且模型由 Google Storage 下載（外部依賴、
  隱私足跡）。
- **選項**：釘特定版本；考慮 self-host WASM + 模型（離線 / 隱私 / 穩定）。
- **驗收**：URL 釘版；（可選）模型改由本站 `public/models/` 提供。

### B3. /history/ 批次資料匯出（次要功能，非缺陷）
- **現況**：個別 PDF 匯出已存在（history →「看詳細」→ /result/ → 下載 PDF）。
  缺「一鍵匯出我的全部評估資料」的可攜功能。
- **選項**：加 client-side「匯出資料（JSON）」於 /history/（純本地、使用者自己的
  資料、不上傳，符合隱私）。
- **驗收**：/history/ 有匯出鈕，下載使用者本地 IndexedDB 的評估資料 JSON。

---

## C. 交付

### C1. push 8 個本地 commit → 部署 live
- 含評估主線改動（ChildProfile / VoiceModule / VideoModule / ResultView / gross-motor
  引擎）。push main 會觸發 GitHub Pages 部署到 `smart-pedi-cds.yao.care`（真實家長
  使用中）——outward-facing，push 前需用戶確認。
- push 後才能做 **A1** 的真實裝置驗證。

---

## 已定性為「非缺陷」（不需修，僅記錄，見 `ce28cbf`）
- 匯出（PDF/FHIR/GCM）不帶錄製語音/影片 = **by-design 隱私**（CLAUDE.md「僅用
  Patient ID」）。上傳孩子媒體反而違規。
- 維度③ `history download exists:false` = 列表頁無捷徑，非無法匯出（見 B3）。

## 本次已修（背景，勿重做）
- #1 gross_motor 落地（`ddf5499`，見 A1）
- 維度③ PDF 稽核假陽性（`7600d5c`）
- ResultView 6-域雷達測試 un-skip（`7600d5c`）
- E2E flaky 穩定化 + worker-safe recorder（`9ad3791`）
- voice/gross-motor wiring 接通（`cb54605`）
- ChildProfile hydration race（`2ff6dba`）
