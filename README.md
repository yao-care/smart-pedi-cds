# CDSS 兒科臨床決策輔助系統

開源的兒科臨床決策輔助系統，以 SMART on FHIR 標準運行於瀏覽器端，任何擁有 FHIR R4 Server 的醫療機構皆可免費使用。

## 特色

- **零後端** — 所有邏輯在瀏覽器執行，部署於 GitHub Pages
- **即插即用** — 醫院接上自己的 FHIR Server 即可運作
- **隱私優先** — 資料僅在瀏覽器與醫院 FHIR Server 之間流動
- **AI 預警** — 規則引擎 + ONNX ML 混合判定，即時風險評估
- **閉環追蹤** — 監測 → 預警 → 介入 → 追蹤 → 結案 自動化流程
- **可客製化** — Fork repo 替換規則與衛教內容即可

## 技術棧

| 元件 | 技術 |
|------|------|
| 框架 | [Astro 5](https://astro.build/) SSG |
| 互動元件 | [Svelte 5](https://svelte.dev/) (runes) |
| 圖表 | D3 子模組 |
| 樣式 | CSS Custom Properties + OKLCH |
| FHIR | [fhirclient.js](https://docs.smarthealthit.org/client-js/) |
| ML 推論 | [ONNX Runtime Web](https://onnxruntime.ai/) (WASM) |
| 資料庫 | IndexedDB via [Dexie.js 4](https://dexie.org/) |
| 搜尋 | [Pagefind](https://pagefind.app/) |
| PDF | jsPDF |
| 部署 | GitHub Pages + GitHub Actions |

## 快速開始

```bash
# 安裝依賴
pnpm install

# 開發模式
pnpm dev

# 建置
pnpm build

# 預覽建置結果
pnpm preview
```

開發伺服器預設在 `http://localhost:4321/smart-pedi-cds/` 啟動。

## 專案結構

```
src/
├── components/        # Svelte 5 互動元件
│   ├── ui/           # 通用 UI (Button, Badge, Modal, Toast...)
│   ├── blocks/       # 頁面區塊 (Header, Footer, Hero, Breadcrumb)
│   ├── fhir/         # FHIR 連線 (LaunchSelector, ConnectionStatus...)
│   ├── dashboard/    # 儀表板 (PatientList, RiskSummary, AlertFeed)
│   ├── patient/      # 個案檢視 (TrendChart, AlertTimeline, PatientView)
│   ├── alerts/       # 預警管理 (AlertCard, AlertFilter, AlertManager)
│   ├── education/    # 衛教 (ContentViewer, InteractionTracker)
│   └── settings/     # 設定 (RuleEditor, WebhookConfig, ModelManager...)
├── engine/           # 客戶端引擎
│   ├── workers/      # Web Workers (rule-engine, baseline, ml-inference)
│   ├── closed-loop.ts
│   ├── notification.ts
│   ├── webhook.ts
│   ├── risk-analyzer.ts
│   ├── fhir-writer.ts
│   └── tab-coordinator.ts
├── lib/              # 共用函式庫
│   ├── fhir/         # SMART on FHIR client + sync
│   ├── db/           # IndexedDB DAOs (Dexie.js)
│   ├── stores/       # Svelte 5 runes stores
│   └── utils/        # 工具 (risk-levels, loinc-map, date)
├── data/             # Content Layer 資料
│   ├── education/    # 衛教 Markdown
│   ├── rules/        # YAML 閾值規則
│   └── baselines/    # 人群基線 JSON
├── layouts/          # Astro 佈局
├── pages/            # 頁面路由
└── styles/           # 設計系統 (OKLCH tokens)
```

## SMART on FHIR 連線

### Standalone Launch

1. 開啟系統，選擇「獨立啟動」
2. 輸入醫院 FHIR Server URL 和 Client ID
3. 完成 OAuth 2.0 + PKCE 授權

### EHR Launch

從醫院 HIS/EHR 系統內嵌啟動，自動繼承病患上下文。

### FHIR Server 需求

- FHIR R4 相容
- 支援 SMART App Launch Framework
- 允許 GitHub Pages 網域的 CORS 請求

## 監測指標

| 指標 | LOINC Code | 單位 |
|------|-----------|------|
| 心率 | 8867-4 | bpm |
| 血氧飽和度 | 2708-6 | % |
| 呼吸頻率 | 9279-1 | breaths/min |
| 體溫 | 8310-5 | °C |
| 睡眠品質 | 93832-4 | 分 (0-100) |
| 活動量 | 82290-8 | 分 |
| 醣類攝取 | 2339-0 | g |

## 預警等級

| 等級 | 說明 | 動作 |
|------|------|------|
| normal | 所有指標正常 | 無 |
| advisory | 單一指標輕微偏離 | 推薦衛教 |
| warning | 多指標偏離或持續異常 | 通知 + 衛教 + Webhook |
| critical | 嚴重異常 | 通知 + 音效 + Webhook + FHIR 寫回 |

## 客製化

### 自訂規則

替換 `src/data/rules/pediatric-default.yaml`，定義年齡組 × 指標 × 閾值。

### 自訂衛教內容

在 `src/data/education/` 新增 Markdown 檔案，frontmatter 需符合 Content Layer schema。

### 自訂 ML 模型

在設定頁面上傳新的 ONNX 模型（7 inputs → 4 outputs），即時替換。

## 授權

MIT License

## 致謝

- [Astro](https://astro.build/)
- [Svelte](https://svelte.dev/)
- [SMART on FHIR](https://docs.smarthealthit.org/)
- [ONNX Runtime](https://onnxruntime.ai/)
- [Dexie.js](https://dexie.org/)
