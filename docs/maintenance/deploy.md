# 建置與部署

## 建置 pipeline
- **prebuild**：`build-content-index.ts`（content-relevance.yaml → `public/data/video-index.json` + `clinical-education.generated.ts`）+ `build-questionnaire-applicability.ts`
- **build**：`astro build` → `dist/`
- **postbuild**：`pagefind --site dist`（搜尋索引）+ `build-sw.mjs`（Service Worker，content-hash 版本）+ `build-manifest.mjs`（PWA manifest）
> 所以正式產物一定要透過 `pnpm build` 跑完整 pipeline，別只跑 `astro build`。

## 網站部署（GitHub Pages via Actions）
- Workflow：`.github/workflows/deploy.yml`（push main 觸發 + `workflow_dispatch`）。build job → upload-pages-artifact → deploy job（deploy-pages）。
- 自訂網域：`smart-pedi-cds.yao.care`（`astro.config.mjs` site；Pagefind base 在 deploy.yml）。

### ⚠️ Action 版本必須保持現行（本次踩過的坑）
GitHub Actions 服務 degraded 時，**過時的 action pin 會在「Set up job / 下載 action」失敗**（其他用新版的專案正常，只有舊版中）。目前已全升現行：
`checkout@v6`、`pnpm/action-setup@v6`、`setup-node@v6`、`upload-pages-artifact@v5`、`deploy-pages@v5`（`lychee-action@v2` floating 已最新）。
→ 維護時定期確認沒落後太多。

### 端到端發布流程
```bash
git checkout -b feat/xxx          # 別直接在 main 開發
# ... 改動 ...
pnpm check && pnpm test --run && pnpm build   # 本機全綠
git commit && （開 PR 或）merge 回 main
git push origin main              # 觸發部署
# 盯部署：
RID=$(gh run list --repo yao-care/smart-pedi-cds --workflow deploy.yml --limit 1 --json databaseId -q '.[0].databaseId')
gh run watch "$RID" --exit-status
# 驗證線上（GitHub Pages CDN 可能忽略 query 快取，需等傳播 + 強制重整）：
curl -s "https://smart-pedi-cds.yao.care/education/" | grep -c '<目標標記>'
```

### 回滾
- `git revert <commit>` → push → 重新部署。
- 部署失敗先看 `gh run view <id> --log-failed`：若是 action 下載/GitHub 事故 → 等恢復重觸發（`gh workflow run deploy.yml --ref main`，或推空 commit）；若是真錯 → 修。

## Cloudflare Worker 部署（貢獻/修改/刪除 → issue）
Worker 在 `workers/education-contribution/`，**獨立於 GitHub Actions**（Cloudflare）。完整步驟見 `workers/education-contribution/DEPLOY.md`。重點：
- 部署：`cd workers/education-contribution && pnpm install && wrangler deploy`（需 `CLOUDFLARE_API_TOKEN` 或 `wrangler login`）。
- 4 個 secret：`GITHUB_APP_ID`、`GITHUB_APP_PRIVATE_KEY`、`GITHUB_INSTALLATION_ID`、`GITHUB_REPO`（`ALLOWED_ORIGIN` 在 `wrangler.toml`）。
- ⚠️ **私鑰必須 PKCS#8 原始 PEM**（非 base64、非 GitHub 下載的 PKCS#1）。轉檔：`openssl pkcs8 -topk8 -nocrypt -in github.pem -out pkcs8.pem`，再 `wrangler secret put GITHUB_APP_PRIVATE_KEY < pkcs8.pem`。詳見 troubleshooting。
- 改 Worker 程式（如新增 issue type）後**務必重新部署**，否則前端送新 type 會被舊 Worker 回 400。
- 目前 URL：`https://education-contribution.lightman-chang.workers.dev`；前端用 repo variable `PUBLIC_CONTRIBUTION_WORKER_URL` 指向它。

## 部署本身改變不可見時
本系統多數內容/重構是 **parity 等價**（行為不變）—— 線上「看不出差別」是正常的，代表沒弄壞。要看可見變化才驗 UI；否則確認 deploy success + 頁面正常渲染即可。
