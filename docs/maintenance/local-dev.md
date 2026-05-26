# 本地開發

## 環境需求
- **Node 22**（CI 用 22；見 `deploy.yml` setup-node）
- **pnpm**（版本由 `package.json` 的 `packageManager` 鎖定，目前 `pnpm@10.32.1`）

```bash
pnpm install            # 安裝依賴
pnpm dev                # 開發伺服器（astro dev）
```
> `predev`/`prebuild` 會自動先跑 `build-content-index` + `build-questionnaire-applicability` 產生衍生資料。所以改完 `content-relevance.yaml` 後重啟 dev 即生效。

## npm scripts 一覽

| 指令 | 作用 |
|------|------|
| `pnpm dev` | 開發伺服器（先跑 predev 產生 index） |
| `pnpm build` | 正式建置（先 prebuild，後 postbuild） |
| `pnpm preview` | 預覽 `dist/`（本機驗證建置結果） |
| `pnpm check` | `astro check` + `svelte-check`（型別） |
| `pnpm lint` | ESLint（`src/`） |
| `pnpm test` | vitest run（全套單元/整合測試） |
| `pnpm test:watch` / `test:ui` | vitest 監看 / UI |
| `pnpm test:coverage` | 覆蓋率 |
| `pnpm test:e2e` | Playwright E2E（`tests/e2e/`） |
| `pnpm curate:videos` | yt-dlp 搜尋衛教影片候選（見 `content-cookbook.md`） |
| `pnpm curate:clean` | 清 curate 暫存 |
| `pnpm rebuild:pdf-font` | 重產 PDF 中文字型 subset（Noto Sans TC） |
| `pnpm generate:cards` | 產 60 張幾何 placeholder 圖卡 |
| `pnpm generate:icons` | 產 PWA icon |

**隱藏的 lifecycle**（不用手動跑）：
- `prebuild` / `predev`：`tsx scripts/build-content-index.ts && tsx scripts/build-questionnaire-applicability.ts`
- `postbuild`：`pagefind --site dist && node scripts/build-sw.mjs && node scripts/build-manifest.mjs`

## 環境變數
- `.env*` 全部 gitignore（只有 `.env.example` 進版控）。
- **`PUBLIC_CONTRIBUTION_WORKER_URL`**：貢獻/修改/刪除表單要打的 Cloudflare Worker URL。
  - 本地 dev：放 `.env.local`
  - production build：走 GitHub repo variable，`deploy.yml` build step 注入

## Base path / 網域
- 單一真相源：`scripts/base.mjs`（`BASE_PATH`、`THEME_COLOR`）。**不要**在 Astro layout frontmatter 直接讀 `import.meta.env.BASE_URL` 做正則（會觸發 esbuild 錯誤，見 `troubleshooting.md`）。
- 網站網域：`astro.config.mjs` 的 `site`（目前 `https://smart-pedi-cds.yao.care`）。

## 提交前自我檢查
```bash
pnpm check && pnpm lint --max-warnings 10 && pnpm test --run && pnpm build
```
全綠才提交。CI（`.github/workflows/ci.yml`）也會跑這些。
