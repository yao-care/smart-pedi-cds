# `src/data/` — 內容資料總覽

本目錄存放所有「**內容類資料**」(content data)，與 `src/lib/` 的「行為類程式」(behavior code) 分開。每個子目錄各自獨立、schema 不同，**不可互相侵入**（歷史上有 markdown 與 yaml 雙重存放影片資料造成 UI 分岔，已用 schema + test 鎖死防止再發生）。

## 子目錄總覽

```
src/data/
├── education/                   📄 衛教文章（純文字）
│   ├── *.md                     一篇一檔（Astro Content Collection）
│   ├── milestones/              發展里程碑子目錄
│   ├── README.md                ← 詳細規則
│   └── _NB_: 不可含 videoUrl / triggerIndicators / format=video|questionnaire
│
├── questionnaire/               📝 CDSA 評估問卷（44 題）
│   └── questions.json           單一 JSON array
│       used by: QuestionnaireModule.svelte（評估流程第 2 步，不在 /education/）
│
├── video-catalog/               🎬 衛教影片元資料（單一來源）
│   ├── official-tw.yaml         Tier 1 台灣官方
│   ├── international.yaml       Tier 2 國際認證
│   ├── pro-kol.yaml             Tier 3 醫療專業 KOL
│   └── README.md                ← 詳細規則 + 維護流程
│
├── education-videos/            🎬 影片 → 評估 trigger 對應
│   ├── cdsa-triage.yaml         CDSA 分流結果
│   ├── cdsa-domains.yaml        CDSA domain 異常
│   ├── cdss-vital-signs.yaml    CDSS 生理警示
│   └── README.md
│
├── baselines/                   🩺 預設兒科生理基線（JSON）
│   └── pediatric-baselines.json
│
├── cards/                       🎴 互動遊戲卡片（JSON）
│   └── index.json
│
└── rules/                       ⚙️ CDSS 規則引擎門檻（YAML）
    └── pediatric-default.yaml
```

## 內容類型 vs 維護單位 vs UI 出現位置

| 內容類型 | 主要檔案路徑 | 維護單位 | 數量 | UI 出現位置 | Schema |
|---------|------------|---------|-----:|------------|--------|
| 📄 文章 | `education/*.md` | 一篇一檔 | 19 | `/education/?format=article` 列表 + `/education/<slug>/` 詳細頁 | `src/content.config.ts` `educationCollection` |
| 🎬 影片 | `video-catalog/<tier>.yaml`<br>+ `education-videos/<cat>.yaml` | 按 tier × category 分檔 | 31 | `/education/?format=video` 列表 + `/result/` `/workspace/result/` 評估結果頁推薦 | `src/lib/education/schemas.ts` (zod) |
| 📝 CDSA 評估問卷 | `questionnaire/questions.json` | 單一 JSON | 44 題 | `/` 開始評估 → **第 2 步**「問卷」（**不在** `/education/`） | 無正式 zod，直接 import |
| 🩺 生理基線 | `baselines/pediatric-baselines.json` | 單一 JSON | 7 indicator × 3 ageGroup | `src/engine/cdsa/triage.ts` z-score 計算用 | Content Layer file loader |
| 🎴 遊戲卡片 | `cards/index.json` | 單一 JSON | 60 張 | `/` 評估流程第 3 步「互動遊戲」 | Content Layer file loader |
| ⚙️ CDSS 規則 | `rules/pediatric-default.yaml` | 單一 YAML | 7 指標 × 4 級 × 3 ageGroup | 規則引擎 worker | Content Layer file loader |

## 兩個常見誤會

### 1. 「📝 問卷 chip 在 `/education/` 為什麼沒內容？」

`/education/?format=questionnaire` 在歷史上預留過 `format='questionnaire'` 的 markdown 衛教 mini-tool，但**從沒寫過任何一篇**。2026-05-21 統一決策：

- 移除 `EducationFilter` 的 📝 chip
- `content.config.ts` 把 markdown format enum 限縮為 `['article']`（一次到位）
- 真正的「問卷」= CDSA 評估流程的 44 題，在 `/` 開始評估後第 2 步

### 2. 「衛教影片要寫在哪？」

**絕對不寫進 markdown frontmatter**。流程：

1. yt-dlp 抓 metadata → 寫進 `video-catalog/<tier>.yaml`
2. 加 trigger 對應 → 寫進 `education-videos/<file>.yaml`
3. `pnpm build:video-index` → 重產 `public/data/video-index.json`
4. `pnpm test` → 跑 4 個 data-integrity 測試

詳見 `video-catalog/README.md`。

## 為何這樣分檔（不是「集中三個 config 在一處」）

| 因素 | 影片 (yaml × 6 檔) | 文章 (md × N 檔) | 問卷 (json × 1 檔) |
|------|------|------|------|
| 量級成長 | 100+ trigger，預期持續加 | 中（< 100 篇）| 小（< 100 題）|
| 變動頻率 | 高（YouTube 影片下架/新增） | 低 | 罕（題庫穩定）|
| 自動化來源 | `pnpm curate:videos` 半自動 | 純人工 | 純人工 |
| Git diff 樣態 | 影片元資料 vs trigger 對應 拆兩層便於 review | 一篇一檔 review 範圍清楚 | 單檔 array 便 jq 批量 |
| Schema 嚴格度 | 最嚴（discriminatedUnion + cross-field refine）| 中（Astro zod）| 鬆（無正式 schema）|

集中成一個 config **沒有好處且製造痛點**：影片 trigger 對應 100+ 筆 vs 文章 19 篇 vs 問卷 44 題，量級不同；自動化、變動頻率、reviewer 視角都不同。維持分檔 + 在這個 README 集中文件化是最佳解。

## 五個守護測試（保證 schema 不被誤侵）

| 測試 | 守護什麼 |
|------|---------|
| `tests/data/education-no-video-fields.test.ts` | markdown 不可含 videoUrl / triggerIndicators / format=video / format=questionnaire |
| `tests/data/education-slug-integrity.test.ts` | yaml 中 educationSlug 對應的 .md 真實存在 |
| `tests/data/inapplicable-consistency.test.ts` | matrix ↔ yaml inapplicable flag 一致 |
| `tests/data/index-consistency.test.ts` | yaml ↔ `public/data/video-index.json` 同步 |
| `tests/data/trigger-uniqueness.test.ts` | 跨 yaml 檔 trigger key 唯一 |
| `tests/data/questionnaire-coverage.test.ts` | 每 ageGroup × applicable domain ≥ 2 題 |

PR-time CI 一定跑到這 6 個測試，違反即 build fail。
