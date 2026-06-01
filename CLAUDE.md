# Smart Pedi 兒童發展評估 — 開發規則

## 專案概述

開源兒童發展評估，以 SMART on FHIR 標準在瀏覽器端執行，零後端，部署於 GitHub Pages（自訂網域 `smart-pedi-cds.yao.care`）。雙角色：家長評估（`/assess` → `/result`）與醫師工作台（`/workspace`，需 FHIR 登入）。

## 技術棧

- **框架**: Astro 6 SSG + Svelte 5 (runes)
- **樣式**: CSS Custom Properties + OKLCH（`src/styles/tokens.css`，僅 7 個 source-of-truth 色 token）
- **內容**: Astro Content Layer API + Zod
- **資料庫**: IndexedDB via Dexie 4.x（瀏覽器端，多版本 upgrade，目前 schema v7）
- **圖表**: D3 子模組（禁止整包 `d3`）
- **ML / 感測**: ONNX Runtime Web (WASM)、MediaPipe Tasks Vision、Meyda
- **FHIR**: fhirclient.js（醫院 standalone）+ 原生 PKCE（GCM 收案）
- **搜尋**: Pagefind　**PDF**: jsPDF　**套件管理**: pnpm

## 強制規則

### 程式碼

- TypeScript strict mode，不允許 `any`
- Svelte 5 runes（`$state`, `$derived`, `$effect`），不用 Svelte 4 stores
- D3 僅允許子模組匯入（`d3-scale`, `d3-shape` 等），禁止 `import * as d3`
- 色彩只用 `tokens.css` 的 7 個 token（`--bg` / `--surface` / `--text` / `--line` / `--accent` / `--warn` / `--danger`），其餘一律 `color-mix()` 衍生；禁止新增色 token。OKLCH + `@supports` hex fallback
- Mermaid 圖表色彩用 hex，不用 oklch()
- 最小字級 18px（`--text-xs`）、最小觸控目標 44px

### 安全

- 禁止硬編碼密碼 / Token / 密鑰
- `console.log` 禁止輸出 PII（姓名、身分證等）；localStorage 也不存 PII
- PDF / FHIR 報告僅使用 Patient ID；不自組 Patient 當身分
- 不使用大陸廠牌 AI 服務

### 架構

- 重計算（規則引擎、基線、ML）放 Web Worker（`src/engine/workers/`：`ml-inference` / `baseline` / `rule-engine`）
- 主執行緒只處理 UI 與閉環狀態
- 多分頁用 BroadcastChannel 協調（`src/engine/tab-coordinator.ts`）
- 離線操作排入 sync queue（`src/lib/db/sync-queue.ts`）
- 業務資料一律進 IndexedDB；設定類用 localStorage；本地 id 用 `crypto.randomUUID()`
- 改 Dexie schema：新增索引欄位要 bump 版本並寫 upgrade tx（`src/lib/db/schema.ts`）；非索引欄位免版本

### 內容

- 衛教 `src/data/education/`（Content Collections）、規則 `src/data/rules/`（YAML）、基線 `src/data/baselines/`（JSON）、問卷 `src/data/questionnaire/`、圖卡 `src/data/cards/`、影片 `src/data/video-catalog/`

## 常用指令

```bash
pnpm dev / build / preview / check / lint
pnpm test / test:watch / test:ui / test:coverage / test:e2e
```

- `predev` / `prebuild` 自動跑 `build-content-index` + `build-questionnaire-applicability`
- `postbuild` 自動跑 `pagefind` → `build-sw` → `build-manifest` → `verify-seo`（SEO 守門，失敗則 build 失敗）
- 產生器：`rebuild:pdf-font`（CJK subset）、`generate:cards`、`generate:icons`、`generate:og`

## 風險等級 vs 分流類別（兩個不同概念，勿混）

- **醫師端風險等級** `RiskLevel`：`normal` / `advisory` / `warning` / `critical`（`src/lib/utils/risk-levels.ts`，severity 0–3，用於 patient `currentRiskLevel` / alerts）
- **評估分流類別**：`normal`（正常）/ `monitor`（追蹤觀察）/ `refer`（建議轉介）（`src/engine/cdsa/triage.ts`，`TriageResult.category`）
- 語意色：低/正常→`--accent`、中→`--warn`、高/緊急→`--danger`，經 `color-mix()` 取深淺

## 目錄結構重點

- `src/engine/` — 客戶端引擎（非 UI）：`cdsa/`（分流 / 評分 / 常模）、`workers/`、`tab-coordinator`、`closed-loop`、`fhir-writer`、`webhook`、`notification`
- `src/lib/` — 共用庫：`fhir/`、`db/`、`stores/`、`baselines/`、`questionnaire/`、`education/`、`pdf/`、`seo/`、`sw/`、`utils/`
- `src/components/` — UI 元件（按功能分目錄：`assess/`、`fhir/`、`workspace/` 等）
- `src/data/` — Content Layer 資料
- `src/pages/` — 路由（`/assess`、`/result`、`/launch`、`/workspace`、`/history`、`/education`、`/settings`）
- `public/` — `models/`（ONNX）、`sounds/`、`fonts/`、`cards/`、`icons/`、`og/`、`data/`

## FHIR 上傳兩條路徑（勿混）

- **醫院 standalone**：fhirclient（`fhir/client.ts`、`launch.ts`、`cdsa-submit.ts`），OAuth callback 在 `/launch/`，逐筆 POST 資源。
- **GCM 收案**：原生 PKCE + 動態註冊（`fhir/gcm-submit.ts`、`gcm-config.ts`），家長從 `ResultView` / `ResultViewWrapper` 發起，callback 同在 `/launch/`（`LaunchCallback.svelte` 依 `sessionStorage['gcm.flow']` 分流），送單一 transaction Bundle。

## Island 水合策略

- 首屏互動 `client:load`、捲動觸發 `client:visible`、低優先 `client:idle`、純展示零 JS（Astro 元件）
