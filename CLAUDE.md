# CDSS 兒科臨床決策輔助系統 — 開發規則

## 專案概述

開源兒科臨床決策輔助系統，以 SMART on FHIR 標準運行於瀏覽器端。
部署於 GitHub Pages，零後端，所有邏輯在瀏覽器執行。

## 技術棧

- **框架**: Astro 5 SSG + Svelte 5 (runes)
- **樣式**: CSS Custom Properties + OKLCH (`src/styles/tokens.css`)
- **內容**: Astro Content Layer API + Zod
- **資料庫**: IndexedDB via Dexie.js 4.x（瀏覽器端）
- **圖表**: D3 子模組（禁止整包 `d3`）
- **ML**: ONNX Runtime Web (WASM) in Web Worker
- **FHIR**: fhirclient.js
- **搜尋**: Pagefind
- **PDF**: jsPDF
- **套件管理**: pnpm

## 強制規則

### 程式碼

- TypeScript strict mode，不允許 `any`
- Svelte 5 runes（`$state`, `$derived`, `$effect`），不用 Svelte 4 stores
- D3 僅允許子模組匯入（`d3-scale`, `d3-shape` 等），禁止 `import * as d3`
- CSS 色彩用 OKLCH + `@supports` hex fallback
- Mermaid 圖表色彩用 hex，不用 oklch()
- 最小字級 18px（`--text-xs`）
- 最小觸控目標 44px

### 安全

- 禁止硬編碼密碼/Token/密鑰
- console.log 禁止輸出 PII（姓名、身分證）
- PDF 報告僅使用 FHIR Patient ID
- 不使用大陸廠牌 AI 服務

### 架構

- 重計算（規則引擎、基線、ML）放 Web Worker
- 主執行緒僅處理 UI 和閉環狀態
- 多分頁用 BroadcastChannel API 協調
- 離線操作排入 sync queue

### 內容

- 衛教內容放 `src/data/education/`（Content Collections）
- 規則放 `src/data/rules/`（YAML）
- 基線放 `src/data/baselines/`（JSON）

## 常用指令

```bash
pnpm dev          # 開發伺服器
pnpm build        # 建置（含 Content Layer 驗證 + Pagefind 索引）
pnpm check        # Astro check + svelte-check
pnpm lint         # ESLint
```

## 預警等級

| 等級 | 代碼 | CSS Token |
|------|------|-----------|
| 正常 | normal | `--color-risk-normal` |
| 注意 | advisory | `--color-risk-advisory` |
| 警告 | warning | `--color-risk-warning` |
| 緊急 | critical | `--color-risk-critical` |

## 目錄結構重點

- `src/engine/` — 客戶端引擎（非 UI）
- `src/lib/` — 共用函式庫（fhir, db, stores, utils）
- `src/components/` — UI 元件（按功能分目錄）
- `src/data/` — Content Layer 資料
- `src/pages/` — Astro 頁面路由
- `src/layouts/` — 頁面佈局
- `public/models/` — ONNX 模型
- `public/sounds/` — 音效檔案

## Island 水合策略

- 首屏互動: `client:load`
- 捲動觸發: `client:visible`
- 低優先: `client:idle`
- 純展示: 零 JS（Astro 元件）
