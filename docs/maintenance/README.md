# 專案維護手冊

CDSA + CDSS 兒童發展智慧評估系統的維運手冊（運維查詢導向）。本手冊是**整合中樞** —— 各頁連結既有文件、補齊缺口、提供任務 cookbook。

## 我要做 X → 看哪頁

| 我想… | 去哪 |
|-------|------|
| 了解系統長怎樣、什麼在哪 | [`overview.md`](./overview.md) |
| 起本地環境、跑指令 | [`local-dev.md`](./local-dev.md) |
| **改/加/刪 衛教文章或影片**、curate、處理貢獻 issue | [`content-cookbook.md`](./content-cookbook.md) |
| 改 預警閾值/常模/問卷/年齡/領域/品牌 | [`data-and-config.md`](./data-and-config.md) |
| 建置、發布上線、回滾、部署 Worker | [`deploy.md`](./deploy.md) |
| 跑測試、看守門測試 | [`testing.md`](./testing.md) |
| 出問題、踩到坑 | [`troubleshooting.md`](./troubleshooting.md) |
| 把架構改作別的主題（如老化評估） | [`../repurpose-to-aging-assessment.md`](../repurpose-to-aging-assessment.md) |

## 維運指令速查
```bash
pnpm dev            # 本地開發
pnpm build          # 建置（含 content-index + pagefind + SW + manifest）
pnpm check          # 型別
pnpm lint           # ESLint
pnpm test           # 全套測試
pnpm test:e2e       # Playwright E2E
pnpm curate:videos  # 找衛教影片候選
```
發布：改動 → `pnpm check && pnpm test --run && pnpm build` 全綠 → merge main → push → `gh run watch` → 驗證線上。

## 既有文件（本手冊連結、不重抄）
- [`../../README.md`](../../README.md) — 公開專案概覽、技術棧、FHIR、預警等級
- [`../../CLAUDE.md`](../../CLAUDE.md) — 開發規則/慣例（TS strict、Svelte 5 runes、OKLCH、44px 觸控、目錄結構、island 水合）
- [`../../src/data/README.md`](../../src/data/README.md) — 內容資料總覽 + 守護測試
- [`../../src/data/video-catalog/README.md`](../../src/data/video-catalog/README.md) — 影片 catalog schema + 維護流程
- [`../../src/data/education/README.md`](../../src/data/education/README.md) — 衛教文章 schema/禁止欄位
- [`../../workers/education-contribution/DEPLOY.md`](../../workers/education-contribution/DEPLOY.md) — Worker 部署完整步驟

## 維護原則（摘自 CLAUDE.md）
- 改前先查 schema / 確認路徑 / 讀文件，禁止 trial-and-error。
- 內容↔情境關聯只在 `content-relevance.yaml` 一處（單一真相源）。
- 臨床內容（文章/影片）一律經維護者判斷後套用（貢獻系統只開 issue）。
- 不硬編碼密鑰；console 不輸出 PII；PDF 僅用 FHIR Patient ID；不用大陸廠牌 AI 服務。
