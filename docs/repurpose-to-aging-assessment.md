# 把本架構改作「老化評估」— 完整執行 Checklist

> 用途：以本專案（兒童發展智慧評估 CDSA + CDSS）為基礎，fork 後改造成「老化評估」。
> 架構（容器）整套可重用；要換的是「領域內容」與「量測方法」。
> 標記：**[CONFIG]** 改值/設定 · **[CONTENT]** 重寫文字內容 · **[SCIENCE]** 需臨床+資料科學的新方法。
> 建議順序：Phase 0 → 1 → 2 先讓「純問卷版」上線；Phase 3（演算法）另案投入。

---

## Phase 0 — Fork 與專案身分（先做，半天）

- [ ] Fork repo 到新名字（例：`smart-geri-cds` / `smart-aging-cds`）。
- [ ] `package.json` `name`（`cdss-pediatric` → 新名）。 **[CONFIG]**
- [ ] `astro.config.mjs` `site:`（→ 新網域）。 **[CONFIG]**
- [ ] `scripts/base.mjs` `BASE_PATH`（GitHub Pages 子路徑；用自訂網域則為空）。 **[CONFIG]**
- [ ] `.github/workflows/deploy.yml` Pagefind 的 `--base` URL（→ 新網域）。 **[CONFIG]**
- [ ] `src/lib/db/schema.ts` IndexedDB 資料庫名（`cdss-pediatric` → 新名）。 **[CONFIG]**
- [ ] `src/lib/fhir/cdsa-resources.ts` FHIR code system URL + display name（內嵌舊網域與「兒童發展智慧評估」）。 **[CONFIG]**
- [ ] 部署設定：GitHub Pages 開啟、自訂網域 DNS、`PUBLIC_CONTRIBUTION_WORKER_URL` repo variable（見 Phase 4 Worker）。

### ⚠️ 部署前必做（本次踩過的坑）
- [ ] **升級 `deploy.yml` 內過時的 GitHub Actions**，否則部署會在「Set up job / 下載 action」失敗：
  - `actions/checkout@v4 → @v6`、`pnpm/action-setup@v4 → @v6`、`actions/setup-node@v4 → @v6`（已在本 repo 修正）
  - 仍待升：`actions/upload-pages-artifact@v3 → @v5`、`actions/deploy-pages@v4 → @v5`（**成對升**）
- [ ] 確認 `package.json` 有 `packageManager: pnpm@x.y.z`（讓 `pnpm/action-setup` 自動偵測版本）。

---

## Phase 1 — 品牌 + 領域骨架（最簡單）

### 1a. 使用者可見文案 **[CONTENT/CONFIG]**
- [ ] `src/layouts/Base.astro`（站名後綴 `兒童發展智慧評估`）
- [ ] `src/layouts/Assess.astro`（description + 可見標題 `兒童發展評估`）
- [ ] `src/components/blocks/Header.astro`（導覽列站名）
- [ ] `scripts/templates/manifest.template.json`（PWA `name`）
- [ ] `src/pages/index.astro`（hero/痛點/3步驟/信任/FAQ/免責 全是兒科文案 → 重寫成老化主題）
- [ ] `src/pages/about.astro`（演算法說明、「六大發展面向」→ 老化評估面向）
- [ ] 各頁 `description`：`assess.astro`、`result/index.astro`、`history.astro`、`education/index.astro`

### 1b. 年齡分段 **[SCIENCE/CONFIG]**
- [ ] `src/lib/utils/age-groups.ts`：`AGE_GROUPS_CDSA`（`2-6m…61-72m` → 老年分段，如 `60-74` / `75-84` / `85+`）；改 `isEligible()`（72 月上限 → 老年下限）、`instructionLevel()`。
  - 影響全站（矩陣欄、問卷適用、常模 key、triage）；型別名可保留 `AgeGroupCDSA` 以減少改動面，或一併改名。

### 1c. 評估領域 enum **[CONFIG]**
- [ ] `src/lib/education/schemas.ts`：`CDSA_DOMAIN_NAMES`（發展領域 → 老化領域，例：`cognition`(認知)、`mobility`(行動/肌力)、`balance_fall`(平衡/跌倒)、`adl`(日常功能)、`mood`(情緒/憂鬱)、`sensory`(視聽覺)、`nutrition`、`social`）。
- [ ] `CDSS_INDICATOR_NAMES`：生理指標名多數通用（心率/血氧/體溫…），視需要增減。
- [ ] 連帶檢查引用處：`src/lib/education/trigger-derivation.ts`（已從 schemas 匯入 enum，單一源）、`src/engine/cdsa/card-selector.ts` 的 `CardDomain`、`src/lib/db/recommendations.ts` 的 `DOMAINS`、矩陣頁 `src/pages/education/index.astro` 的領域中文標籤、`src/engine/cdsa/triage.ts` 的 `DOMAIN_LABELS`。

### 1d. 「不適用」矩陣 **[CONFIG]**
- [ ] `src/data/education/content-relevance.yaml` 的 `inapplicable:` 區：定義新的「哪些 領域×年齡 不評估」。

---

## Phase 2 — 內容（量大，但工具現成）

> 本層全靠你已建好的單一源系統：改 `content-relevance.yaml` + 文章 `.md` + `video-catalog`，跑 `pnpm build`，三視圖（矩陣/評估後推薦/觸發影片）自動更新。

- [ ] **問卷** `src/data/questionnaire/questions.json`：全部重寫成老化評估題（可採現成量表：MMSE/MoCA 認知、ADL/IADL 功能、Morse/STEADI 跌倒風險、Fried 衰弱、GDS 憂鬱、MNA 營養）。保留結構（domain + ageGroups + text + clinicallyReviewed）。 **[CONTENT/SCIENCE]**
- [ ] **衛教關聯** `src/data/education/content-relevance.yaml`：trigger 命名沿用 `cdsa.domain.<領域>.anomaly.<年齡>` 格式但換成新領域/年齡；severities、browse、clinicalAlertEducation 機制照用。 **[CONFIG]**
- [ ] **衛教文章** `src/data/education/*.md`：重寫（跌倒預防、肌少症運動、認知訓練、用藥安全、營養）。刪掉兒科文章（gross-motor-activities、milestones/、nutrition-長高… 等）。 **[CONTENT]**
- [ ] **影片** `src/data/video-catalog/*.yaml` + curate 工具（`pnpm curate:videos`，白名單頻道在 `scripts/curate/channel-seeds.json`、關鍵字 `scripts/curate/keywords.json`）：換成老年衛教頻道與關鍵字重新 curate。 **[CONTENT]**
- [ ] **常模/門檻** `src/data/baselines/*.json`、`src/data/rules/*.yaml`：生理參考範圍換成老年常模（結構：mean/std/min/max/p25/p75 per 年齡×性別×指標 照用）。改檔名與 `src/content.config.ts` 的引用。 **[CONFIG/SCIENCE]**
- [ ] **遊戲卡** `src/data/cards/index.json`：換成適合長者的刺激素材，或停用（若 Phase 3 不做互動式量測）。 **[CONTENT]**
- [ ] 守門測試會擋你（這是好事）：
  - `tests/education/content-index-parity.test.ts` 的「**每個適用格都有文章+影片**」覆蓋率測試 → 確保每個新領域×年齡格都補齊。
  - `tests/data/education-slug-integrity.test.ts`（slug 對應 `.md` 存在）、`trigger-uniqueness`。
  - 內容大改後,parity 對「重構前 fixture」的比對可重設或移除（那是本 repo 重構期的產物）。

---

## Phase 3 — 評估演算法（最難，需臨床 + ML，可延後）

> `src/engine/cdsa/` 的量測法是兒科專屬科學，**不是改設定能解決**。框架（z-score → 雷達圖 → 分流 normal/monitor/refer → 閉環警示 → FHIR 提交）通用、可留。

- [ ] `drawing-analysis.ts`（畫圖成熟度 ONNX）→ 老年改 clock-drawing / 視空間;或停用。 **[SCIENCE]**
- [ ] `gross-motor-analysis.ts`（MediaPipe pose 抓兒童動作里程碑）→ 老年改步態/平衡/跌倒風險生物力學;或停用。 **[SCIENCE]**
- [ ] `voice-analysis.ts`（兒童音域 80–600Hz）→ 老年改構音/音量/顫抖;或停用。 **[SCIENCE]**
- [ ] `triage.ts` 預設 z-score 常模值（兒童族群統計）→ 換老年常模;`/public/models/risk-model.onnx` 用老年資料重訓。 **[SCIENCE]**
- [ ] **建議的 Phase 3 起步**：先停用 pose/drawing/voice 三個感測模組（`assessment-analyzer.ts` 不呼叫它們），**先上線「純問卷量表」版老化評估**;待有老年量測方法再逐步加回。

---

## ✅ 原封不動帶走（容器，不要改）

- content-relevance 單一源 + `scripts/build-content-index.ts` + 三視圖投影
- 新增/修改/刪除 → GitHub issue 流程：`src/components/education/ContributionModal.svelte` + `workers/education-contribution/`（只有 `issue-formatter.ts` 的模板字串提到「發展領域」要改）
- SMART-on-FHIR：`src/lib/fhir/*`
- IndexedDB/Dexie：`src/lib/db/*`（除 schema.ts 的 DB 名）
- 多租戶：`src/lib/utils/tenant.ts`
- PDF：`src/lib/pdf/*`（中文字型 runtime fetch + Identity-H）
- 搜尋（Pagefind）、預警等級、規則引擎/基線/ML worker（吃 YAML 設定）
- CI/部署 pipeline（`.github/workflows/`，除上面列的字串）

---

## Phase 4 — 上線流程（本次驗證過的步驟）

- [ ] **Cloudflare Worker**（貢獻/修改/刪除→issue 用）：`workers/education-contribution/` 重新部署。
  - 設 4 個值：`GITHUB_APP_ID`、`GITHUB_APP_PRIVATE_KEY`（**PKCS#8 PEM**，非 base64；GitHub 下載的是 PKCS#1 要先 `openssl pkcs8 -topk8` 轉檔）、`GITHUB_INSTALLATION_ID`、`GITHUB_REPO`；`ALLOWED_ORIGIN` 在 `wrangler.toml`。
  - `CLOUDFLARE_API_TOKEN=... wrangler deploy`。詳見 `workers/education-contribution/DEPLOY.md`。
- [ ] 前端 `PUBLIC_CONTRIBUTION_WORKER_URL`：設為新 Worker URL（repo variable，`deploy.yml` build 注入）。
- [ ] GitHub App：建一個（Issues: Read&write、裝到新 repo）。
- [ ] `pnpm check`、`pnpm lint`、`pnpm test`、`pnpm build` 全綠。
- [ ] push main → GitHub Actions 部署 → `gh run watch` 盯 success → curl 線上頁面驗證。

---

## 驗證（end-to-end）

- [ ] `pnpm test`：含 content 覆蓋率、slug 完整性、closed-loop、schema enforcement。
- [ ] 本機 `pnpm dev`：跑完一次評估流程，確認結果頁依（年齡×領域×分流）顯示對的文章+影片。
- [ ] `/education/` 矩陣：欄=新年齡段、列=新領域、不適用格顯示「不適用」、其餘格有內容或「＋」。
- [ ] 貢獻/修改/刪除按鈕 → 確認在新 repo 開出 issue。

---

## 工作量誠實評估

| 層 | 難度 | 誰能做 |
|----|------|--------|
| Phase 0–1（品牌/設定/enum/年齡） | 低 | 工程即可,半天～1 天 |
| Phase 2（內容） | 中（量大） | 工程 + 臨床審內容,用現成工具 |
| Phase 3（演算法/量測/常模/ML） | 高 | **臨床 + 資料科學**,是真正的新專案核心 |

**結論：Phase 0–2 用現有架構與工具就能做出一個「純問卷版老化評估」上線;Phase 3 是另一段需要臨床與 ML 投入的領域工程。**
