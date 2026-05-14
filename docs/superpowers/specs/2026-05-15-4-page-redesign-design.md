# 4 頁面重新規劃 — 設計文件

## Context

E2E 測試後（2026-05-14）發現 4 個頁面在資訊架構與基本實作上有問題：

1. **評估結果頁 (10-result)** — 暴露 raw metric（`reactionLatency 9352.50` 等）給家長；雷達圖無多邊形（資料未綁定）；長頁面缺乏 hero 區。
2. **衛教列表 (11-education)** — 16 張卡平鋪、無分類篩選、影片 / 文章視覺差異弱、無 cover。
3. **圖卡審核 (14-admin-cards)** — 60 張縮圖**全部空白**（BASE_URL 從 `/smart-pedi-cds` 改 `/` 後路徑拼接出現雙斜線）；無 status / domain filter；標題用技術 ID。
4. **評估歷史 (15-history)** — 嚴重簡陋，一行紀錄 + 大片空白，缺空狀態、PDF 重下、比較。

本次重規劃在 1 個 spec 內處理 4 頁，因為它們共用設計 token，重做時集中作業效率較高。

## 受眾分流原則

- **家長**：簡視 + 行動導向，避免技術術語
- **醫師**：完整 metric + FHIR 操作，獨立路徑

## 頁面 1：評估結果頁（拆兩個獨立頁）

### 1A. 家長簡視 — `/result/`（沿用原路徑）

#### 目標

讓家長 10 秒內看懂「結果為何 + 我該做什麼」。

#### 資訊架構（由上至下）

1. **Hero 分流結果區**
   - 大字分流類別（正常 / 追蹤觀察 / 建議轉介）+ 對應顏色 + emoji
   - 一句解讀（例：「7 個面向需要關注，建議和兒科醫師談談」）
   - 信心度小字呈現

2. **雷達圖（修好資料綁定）**
   - 8 個 domain（粗動作 / 細動作 / 語言理解 / 語言表達 / 認知 / 社會情緒 / 行為 / 飲食）
   - 分數 0-100 正規化（從 z-score 換算）
   - 異常 domain 用紅點標示

3. **為您挑選的衛教**（沿用 EducationMatch，視覺升級為 card grid）
   - 套用設計 token 的 card style
   - 每張卡顯示 icon + 標題 + 一行 summary

4. **行動按鈕區**
   - 主：下載 PDF 報告
   - 副：查看評估歷史 / 開始新評估
   - 醫師可見：傳送至 FHIR（authStore.isAuthenticated 時）

#### 必要 / 不必要

| 必要 | 不必要 |
|------|--------|
| 分流類別 + 簡短解讀 | raw metric 表（移到醫師頁 / PDF） |
| 雷達圖視覺化 | z-score 數字 |
| 衛教推薦 card grid | 完整 metric 名稱 |
| PDF 下載 | 細節 metric 排版 |
| Disclaimer | 重複的 disclaimer |

### 1B. 醫師詳視 — `/workspace/result/[id]/`（新增）

#### 目標

讓醫師看到完整 metric、可加備註、可送 FHIR。

#### 資訊架構

1. **頂部摘要 bar**：兒童 ID（abbreviate）+ 評估日期 + 月齡 + 分流類別
2. **完整 metric 表**：domain 分組，每行 `metric / value / z-score / 異常 flag`，z-score 顯示色帶
3. **時序事件 timeline**：assessment events（click latency 分布、語音 segments）— 簡單版即可
4. **自由備註欄**（textarea，存 IndexedDB `Assessment.physicianNote`）— **此欄位 schema 沒有，需新增 schema v5 並擴充 `Assessment` interface**：
   ```ts
   physicianNote?: string;
   physicianNoteUpdatedAt?: Date;
   ```
5. **FHIR 提交**：保留現有按鈕
6. **下載 PDF**：醫師版 PDF（已 commit 中文字型）

#### 路由與權限

- 路由：`/workspace/result/[id]/`
- 進入方式：醫師工作台 patient detail page 內連結；歷史頁的「看詳細」若 `authStore.isAuthenticated` 為 true 連到此頁，否則連到家長簡視頁
- 未登入 FHIR 時，導向家長簡視頁（SSG 環境用 client-side `$effect` 檢查並 `window.location.replace`）

#### 資料來源（**重要：跨裝置情境**）

Astro SSG 純前端、家長端評估資料只存在**家長那台裝置**的 IndexedDB。醫師裝置上不會有原始 Assessment。因此 1B 必須走雙軌：

```
讀取 Assessment by id：
  1. 先試 db.assessments.get(id)（同裝置情境）
  2. 失敗 → 從 FHIR server 拉
     - GET DiagnosticReport?identifier=cdsa-{id}（依現有 submit 慣例反查）
     - 取 DiagnosticReport.result[] → batch GET Observation/{ref}
     - 反序列化 Observation.valueQuantity / valueString 為 metric rows
     - 不會還原 raw event timeline（FHIR submit 只送 metrics + triage，未送 event-level data）
  3. 兩者都失敗 → 顯示「找不到此評估」+ 返回連結
```

**資料完整度說明（顯示在頁面頂）**：
- IDB 來源：完整 metric + event timeline + 雷達圖
- FHIR 來源：完整 metric + 分流結果，**無 event timeline**（FHIR 不送原始事件流；timeline 顯示「此資料來自 FHIR server，無原始事件紀錄」）

#### 新增模組

- `src/lib/fhir/assessment-fetch.ts`：`fetchAssessmentFromFhir(id, fhirClient): Promise<Assessment | null>`
  - 內部走 DiagnosticReport → Observation references → 重組為 Assessment-shape 物件
  - 標記資料來源 (`source: 'fhir'`)
- `src/lib/db/assessment-resolver.ts`：`resolveAssessment(id): Promise<{ assessment, source: 'idb' | 'fhir' }>`
  - 統一 entry point 給 1B 頁與歷史比較使用

---

## 頁面 2：衛教列表 — `/education/`

### 目標

讓家長從 16+ 篇衛教中快速找到想看的。

### 資訊架構

```
[Header]
[搜尋框（占位，Pagefind 整合放下次）]
[分類 chip filter（橫向 chips，可多選）：
  全部 飲食 睡眠 呼吸 運動 里程碑 一般]
[格式 toggle：全部 / 📄 文章 / 🎬 影片]
[Card grid（auto-fill, minmax(280px, 1fr)）]
  └ 卡片：
    左上：format icon（📄 or 🎬，大）
    上：category badge + age group badges
    中：title (semibold)
    下：summary (muted, 2 行截斷)
    右下：「閱讀 →」link
```

### 互動

- 篩選用 URL query string 持久化（`?cat=diet&format=video`），方便分享
- 純前端 filter（不重新查詢，現有 collection 一次撈完）

### 必要 / 不必要

| 必要 | 不必要 |
|------|--------|
| 分類 + 格式 filter | 全文搜尋（下次做） |
| Format icon 區分文章/影片 | 預覽 modal |
| 年齡層 badges | 排序選項 |
| Empty state（filter 無結果） | 收藏 / 標記功能 |

---

## 頁面 3：圖卡審核 — `/admin/card-review/`

### Bug 修正（先做）

**現象**：60 張縮圖全部空白。

**根因（推測 + 待實測）**：`card-review.astro` 內 `<img src={...BASE_URL/cards/...filename}>`。當 `BASE_URL` 是 `/`（root 部署）時拼接結果看似正確，但實測縮圖空白。

**實作步驟（按順序試）**：
1. `pnpm build` 後 grep `dist/admin/card-review/index.html` 確認實際 `<img>` 的 src 值
2. 確認 `dist/cards/{domain}/*.webp` 都存在
3. 若 src 路徑對但圖片不在 dist：可能是中文檔名（`-亮.webp` / `-透.webp`）造成 Astro `public/` 複製或 URL 編碼問題 → 改 `generate-placeholder-cards.mjs` 用 ASCII 命名（`-light.webp` / `-transparent.webp`）並重產 60 張卡，同步更新 `src/data/cards/index.json` 的 filename
4. 確認瀏覽器端 fetch 時 URL 是否 encode 正確（DevTools Network panel）

**備用**：若仍無法解，改用 Astro `<Image>` 或在 build 階段把 webp 移到 `src/assets/cards/` 走 Astro asset pipeline。

### 目標

醫師快速 spot-check 圖卡品質，按 domain / status 篩選。

### 資訊架構

```
[Header + 說明文字]
[統計列：總 60 / 待審 0 / 通過 60 / 退回 0]
[Status filter tabs：全部 | 待審 | 通過 | 退回]
[Domain filter chips：8 個 domain（單選）]
[Card grid（240px min）]
  └ 卡片：
    縮圖（aspect-ratio 1）
    status badge（已通過/待審/退回，色彩對應）
    Title: card.description（中文，例「認知：圓形（亮）」）
    Subtitle: card.id（小字 muted，例 cognition-01）
    Attribution / license 小字
```

### 必要 / 不必要

| 必要 | 不必要 |
|------|--------|
| 修縮圖載入 | in-app approve/reject 按鈕（仍走編輯 index.json） |
| Status + domain filter | 縮圖 lightbox / 全螢幕預覽 |
| 中文 title | 多語切換 |
| 統計列 | sort by date |

---

## 頁面 4：評估歷史 — `/history/`

### 目標

家長看到時間軸 + 可重下 PDF；醫師看到病人歷次評估趨勢。

### 資料來源（跨裝置情境）

歷史頁兩種來源依登入狀態切換：

| 情境 | 列表來源 | 詳細展開 |
|------|---------|---------|
| 未登入 FHIR（家長端） | `db.assessments.where('childId').equals(id)` | 同 IDB |
| 已登入 FHIR（醫師工作台） | `GET DiagnosticReport?subject=Patient/{fhirId}&category=cdsa` 取列表 | 點開時走 1B 同款 resolver |

醫師端來源切換用 store 屬性（如 `assessmentStore.dataSource = 'fhir' | 'idb'`）並在頁面顯示來源 badge（「來自 FHIR Server」/「本地紀錄」）。

### 必要前提

`src/lib/fhir/assessment-fetch.ts` 內額外加：
- `listAssessmentsFromFhir(patientId): Promise<AssessmentSummary[]>` — 回 list view 所需的 summary（id / date / category / age）。不一次拉所有 Observation，列表頁只取 DiagnosticReport.conclusion 與 effectiveDateTime。
- 比較模式選 2 筆時才 batch-fetch 完整 metric。

### 資訊架構

#### Empty State（無紀錄時）

```
🌱
還沒有評估紀錄
完成第一次評估後，紀錄會在這裡保留。
[ 開始評估 ]（CTA 按鈕）
```

#### 有紀錄時

```
[Header「評估歷史」]
[統計卡列（3 張）：
  總評估次數 X
  最近一次 YYYY/MM/DD
  主要分流類別（最近 1 次的）]
[Timeline / List]
  □ 2026/05/14 23:21
    24 個月 · [建議轉介] · 異常面向：粗動作、細動作、語言…
    └ [📄 PDF] [👁 看詳細] [⚖️ 加入比較]
  □ 2026/04/02 18:00
    23 個月 · [追蹤觀察]
    └ ...
[ 比較區（選 2 筆以上時出現）]
  └ 並排雷達圖 + 進步/退步指標（z-score 差）
```

### 互動

- 比較模式：勾選 ≥ 2 筆 → 底部 sticky bar 顯示「比較 2 筆 →」按鈕 → 切換到並排雷達圖檢視
- 比較雷達圖：同一個 SVG，多個多邊形不同顏色 + legend 標日期

### 必要 / 不必要

| 必要 | 不必要 |
|------|--------|
| Empty state | 趨勢線圖（雷達圖內已表達） |
| 重下 PDF | 匯出全部紀錄為 CSV |
| 分流類別 badge | 評估細項展開 |
| 比較功能（並排雷達圖） | 統計 export |
| 看詳細（連到 result 頁） | 多兒童切換（單兒童使用情境） |

---

## 跨頁面一致性

### 設計 token 套用

所有新元件遵守 `src/styles/tokens.css`：
- 顏色：`--color-risk-{normal,advisory,warning,critical}` 對應分流
- Card style: `border: 1px solid var(--border-default); border-radius: var(--radius-lg); background: var(--bg-surface)`
- Spacing: 用 `--space-*` 變數

### Empty state pattern

所有列表頁（education / history / admin card-review filter 結果）皆需 empty state UI（icon + 主訊息 + CTA）。

### Mobile responsive

所有 grid 使用 `repeat(auto-fill, minmax(280px, 1fr))` 確保響應式。Filter chips 橫向可捲動。

---

## 不在本 spec 範圍（明確排除）

- Pagefind 全文搜尋整合 → 下次
- 雷達圖 lib 升級（目前自製 SVG 即可）→ 下次
- 醫師工作台首頁改造 → 下次
- i18n（仍只支援 zh-TW）→ TODO #1
- 圖卡審核的 in-app approve workflow → 仍維持「編輯 index.json 並 commit」

---

## 驗證

實作完成後：
- `pnpm check && pnpm lint && pnpm test`（全綠）
- `pnpm build && pnpm preview` 開瀏覽器手動走每一頁
- DevTools mobile viewport 確認響應式無壞
- Console 無新 error
- 4 個頁面手動截圖，比對前後差異
- /workspace/result/[id]/ 在未登入時要 redirect 到 /result/

---

## 受影響檔案概覽

| 頁面 | 主要檔案 |
|------|---------|
| 1A 家長簡視 | `src/components/assess/ResultView.svelte` 大改 + `src/components/assess/RadarChart.svelte` 修資料綁定 |
| 1B 醫師詳視 | `src/pages/workspace/result/[id].astro`（新）+ `src/components/patient/ResultDetail.svelte`（新） |
| 2 衛教列表 | `src/pages/education/index.astro` 大改（filter 邏輯） |
| 3 圖卡審核 | `src/pages/admin/card-review.astro` 中改（filter + bug 修） |
| 4 評估歷史 | `src/pages/history.astro` + `src/components/assess/AssessmentHistory.svelte` 大改（empty state + timeline + 比較 + FHIR 來源切換） |
| 跨裝置資料層 | `src/lib/fhir/assessment-fetch.ts`（新，fetchAssessmentFromFhir / listAssessmentsFromFhir） + `src/lib/db/assessment-resolver.ts`（新，雙來源 entry point） |
| Schema | `src/lib/db/schema.ts` 升 v5：`Assessment.physicianNote`、`Assessment.physicianNoteUpdatedAt` |

新增測試（可選 / 視時間）：
- 衛教 filter 純函式測試
- AssessmentHistory 比較邏輯測試
