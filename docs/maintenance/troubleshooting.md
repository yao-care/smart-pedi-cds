# 疑難排解 / 已知陷阱

> 彙整自專案記憶與實戰經驗。遇到問題先查這頁。

## 部署 / GitHub

**部署沒觸發 / `workflow_dispatch` 回 HTTP 500**
- 多半是 GitHub Actions 事故。查 `curl -s https://www.githubstatus.com/api/v2/components.json`（看 Actions 元件）+ `incidents/unresolved.json`。事故期間 push webhook 可能漏接、dispatch 500。
- 對策：等恢復後 `gh workflow run deploy.yml --ref main`，或推一個空 commit（`git commit --allow-empty`）重新觸發。

**build 掛在「Set up job / Getting action download info」**
- 過時的 action pin 在 GitHub degraded 時抓不到（codeload 不穩）。同一 run 若有新版 action 成功、舊版失敗，就是這個。
- 對策：把 action 升到現行版本（見 `deploy.md`）。判斷方法：`curl -sI https://codeload.github.com/<owner>/<action>/tar.gz/<sha>` 若 200 代表檔案在、是 runner 端下載問題。

**改了卻線上沒變**
- GitHub Pages CDN 可能忽略 query string 快取，`?_=timestamp` 不一定繞得過。等 1–2 分鐘傳播 + 瀏覽器強制重整（Cmd+Shift+R）。curl 偶爾拿到暫時空回應，重抓即可。

## Cloudflare Worker

**Worker 開 issue 失敗 / GitHub App auth 失敗**
- **私鑰格式**：必須 PKCS#8 原始 PEM（`-----BEGIN PRIVATE KEY-----`）。GitHub 下載的是 PKCS#1（`BEGIN RSA PRIVATE KEY`），Web Crypto 不支援。`universal-github-app-jwt` 在 Workers 不轉換 → 一定要先 `openssl pkcs8 -topk8 -nocrypt`。也**不要 base64**（Worker 不解碼）。
- 設 secret 用檔案重導向保留換行：`wrangler secret put GITHUB_APP_PRIVATE_KEY < pkcs8.pem`。

**前端按鈕送出 400 / 新功能沒反應**
- 改了 Worker 程式（如新 issue type）卻沒重新部署 → 線上舊 Worker 不認新 type。`wrangler deploy` 後再上線前端。

**CORS 錯誤**
- 確認 Worker 的 `ALLOWED_ORIGIN`（`wrangler.toml`）= 網站網域。

## Svelte 5 runes（已踩過）
- `$derived.by(() => {...})` 用於 block body，不是 `$derived(() => {})`。
- `$state` array 的 `.push()` 不觸發 reactivity → 用 spread `[...arr, item]`。
- `$state` proxy 不能直接存 IndexedDB → `JSON.parse(JSON.stringify(...))`。
- `bind:this` 在條件渲染中可能延遲 → 用 `use:action` 或 `$effect` + `requestAnimationFrame`。
- 用 prop 當 `$state` 初值會觸發 `state_referenced_locally` warning → 加 `// svelte-ignore`。

## Astro + esbuild（已踩過）
- **不要**在 layout frontmatter 對 `import.meta.env.BASE_URL` 做 `.replace(/\/$/,'')`（觸發 esbuild「Unterminated string literal」）→ 從 `scripts/base.mjs` 匯入 `BASE_PATH`。
- Astro `<script>` inline import 註解含 em-dash 或 `()` 可能造成 esbuild 解析錯誤 → 改用外部 `.ts` entry + `<script src>`。
- `public/` 內任何檔會原樣複製到 `dist/` → SW/manifest 模板放 `scripts/templates/`，由 build script 注入（避免佔位符洩漏到 production）。

## 其他
- **PDF 中文亂碼/空白**：jsPDF `addFont` 必傳第 4 參 `'Identity-H'`（CJK CID 編碼）；字型 runtime fetch（`src/lib/pdf/font-loader.ts`）。重產 subset：`pnpm rebuild:pdf-font`。
- **測試裝不起來**：pnpm 嚴格模式需顯式裝 `@sveltejs/vite-plugin-svelte`。
- **curate 撞 YouTube 429**：pipeline 沒帶 cookie；改 `yt-dlp --cookies-from-browser chrome` 手動取 metadata。
