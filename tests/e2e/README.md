# 檢測覆蓋 E2E（detection-coverage）

驗證「不同年齡層的檢測是否正確落實」——資料驅動、對每個 (年齡 × 面向 × 分數)
實跑真實評估，斷言數值正確落地 IndexedDB，並附完整性稽核。

## 跑法

```bash
# 對本機 production build（pnpm build 後 pnpm preview）跑三維度
pnpm test:detection

# 對 live 跑（自訂 base URL；注意 live 未含未 push 的本地變更）
PLAYWRIGHT_BASE_URL=https://smart-pedi-cds.yao.care pnpm test:detection

# 讀 test-results/coverage/ 的 shard 比對應測清單，印涵蓋率 / 漏測 / 逾測 / 分齡明細
pnpm test:coverage-audit   # 漏測則 exit 1
```

> 覆蓋紀錄採每 worker 一個 NDJSON shard（`test-results/coverage/shard-*.ndjson`），
> 一次性 reset 由 `global-setup.ts` 於所有 worker 前執行。`test:coverage-audit`
> 需在一次**完整** `test:detection`（含維度①②）之後跑，才會 100%。

## 三維度

- **①數值落地**：對 (年齡 × 面向 × 分數) 全枚舉（190 單元），斷言
  `assessments.triageResult.details` 的 `questionnaireScore` z 值與 ASQ-3 Table 18
  常模換算一致（`toBeCloseTo(expectedZ, 4)`）。此維度只需穿越主動模組抵達結果頁，
  故 voice/video 走**確定性 skip 路徑**（不受 headless 媒體時序影響）。
- **②媒體落地 + 接線**：每齡跑一次「跑完整評估」（全 domain=0 → 不 skip 任何
  模組），**真的錄音/錄影/繪圖**，斷言 `mediaFiles` blob `bytes>0`；並稽核
  `voice→language`（voiceDurationTotal 事件數學，硬斷言）與 `video→gross_motor`
  （MediaPipe on fake video，soft annotation）。真錄音靠 `installMediaStubs` 把
  headless 的 `speechSynthesis` stub 成立即回 `onend`（否則 `playTTS` 掛住）。
- **③匯出完整性**：完成評估後檢查 PDF / FHIR / GCM / 歷史下載四出口是否帶媒體，
  以 annotation 記錄（缺口報告）。

## 並發

`detection-coverage` 是重瀏覽器 spec（每筆走完整評估）。單機同時跑太多 headless
分頁的 CPU 競爭會讓偶發一筆撞 test timeout。config：**CI `workers=1`（最穩）、
本機上限 `2`**；`retries`（CI 2 / 本機 1）吸收偶發環境停頓。已驗 `workers=1`
retries=0 全淨。

## 已落地（非缺口，2026-07-08）

- voice / gross-motor 主動模組分析已接通 triage（`active-module-analysis.ts` +
  ResultView 背景 enrich）；維度②端到端驗證此接線。
- 尚待：voice 上傳出口、四匯出帶媒體（維度③ annotation 持續照出）。
