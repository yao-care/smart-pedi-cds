# 衛教內容維護 Cookbook（核心）

> 統一單一源：所有「文章/影片 ↔ 情境」的關聯都在
> **`src/data/education/content-relevance.yaml`** 一個檔。改完 `pnpm build`，三視圖（矩陣 / 評估後推薦 / 觸發影片+closed-loop）自動更新。
> schema 細節見 `src/data/README.md`、`src/data/video-catalog/README.md`、`src/data/education/README.md`。

## 心智模型
- **內容自己的事實** → 留在內容檔：文章本文 `src/data/education/<slug>.md`、影片 metadata `src/data/video-catalog/<tier>.yaml`。
- **「出現在哪」= 關聯** → 只在 `content-relevance.yaml`。
- 檔案結構：
  ```yaml
  inapplicable:                 # 哪些 領域×年齡 不評估（顯示「不適用」、不可貢獻）
    behavior: [2-6m, 7-12m]
  triggers:
    - trigger: cdsa.domain.<領域>.anomaly.<年齡>   # 或 cdss.* / cdsa.triage.*
      videoIds: [<11碼ID>]
      articles:
        - { slug: <文章>, severities: [monitor, refer], browse: true }
  clinicalAlertEducation:        # closed-loop 警示用 indicator → 文章
    sugar_intake: [diet-control]
  ```
  - `browse: true`：該文章是矩陣顯示的「主文章」（= 舊 educationSlug）。
  - `severities`：只有 `cdsa.domain.*` 格的文章需要（決定哪些分流結果會推薦它）；省略則**不進推薦**（只當瀏覽/browse）。

## 兩道守門測試（會擋你，是好事）
- **覆蓋率**（`tests/education/content-index-parity.test.ts`）：每個「適用」格必須 ≥1 文章 + ≥1 影片。刪到某格變空 → 擋。
- **slug 完整性**（`tests/data/education-slug-integrity.test.ts`）：`content-relevance.yaml` 每個 `slug` 必須有對應 `.md`。刪文章沒清乾淨 → 擋。
- 共通收尾：`pnpm build && pnpm test --run`。

---

## 修改文章（內容/標題）
位置不用動，只改文章本身：
1. 編輯 `src/data/education/<slug>.md`（frontmatter `title`/`summary` 或內文）
2. `pnpm build`（標題/摘要會流進推薦顯示；內文更新 `/education/<slug>/`）
3. `pnpm test --run` → commit → push

## 新增文章
1. 新增 `src/data/education/<slug>.md`（符合 `src/content.config.ts` education schema：title/summary/category/ageGroup/format:'article'/publishedAt/locale）。**勿**放 videoUrl/triggerIndicators（schema 禁止）。
2. 在 `content-relevance.yaml` 把它掛到要出現的格：`articles: - { slug: <新slug>, severities: [...], browse: true }`
3. `pnpm build && pnpm test --run` → commit → push

## 刪除文章（兩步，順序重要）
1. 查引用：`grep -n "slug: <slug>" src/data/education/content-relevance.yaml`
2. 移除所有 `- slug: <slug>` 條目（⚠️ 若某格只剩這篇 → 先補別篇，否則覆蓋率測試擋）
3. `git rm src/data/education/<slug>.md`
4. `pnpm build && pnpm test --run` → commit → push

## 新增影片
1. 取得影片 metadata（`yt-dlp` 或 `pnpm curate:videos`，見下），寫進對應 tier：`src/data/video-catalog/<official-tw|international|pro-kol>.yaml`（符合 item schema：videoId/title/channel/channelId/duration/…/verificationStatus:'verified'）。
2. 在 `content-relevance.yaml` 對應 trigger 的 `videoIds:` 加上該 ID。
3. `pnpm build && pnpm test --run` → commit → push
> 注意：build 只收 `verificationStatus: 'verified'` 的影片；非 verified 會被過濾掉（等於該格少一支）。

## 刪除影片
- **只從某格拿掉**：編 `content-relevance.yaml`，從該 trigger 的 `videoIds:` 移除該 ID。
- **整個移除**：(1) `grep -n "<videoId>" src/data/education/content-relevance.yaml` 找所有格 → 移除；(2) 從 `src/data/video-catalog/<tier>.yaml` 刪該筆 metadata。
- ⚠️ 若某格刪到 0 支 → 覆蓋率測試擋，先補別支。
- `pnpm build && pnpm test --run` → commit → push

## 用 curate 工具找影片
```bash
pnpm curate:videos --category cdsa.domain      # 或 --trigger <triggerKey>
```
- 只在**白名單頻道**內搜尋（`scripts/curate/channel-seeds.json`），安全。
- 搜尋詞在 `scripts/curate/keywords.json`（格式見 `scripts/curate/keywords.README.md`）；新領域要先在此加關鍵字。
- 產出候選報告於 `scripts/curate/reports/`（gitignored）；人工複審後把好的寫進 catalog + content-relevance。
- ⚠️ 已知：pipeline 可能撞 YouTube 429；可改 `yt-dlp --cookies-from-browser chrome` 手動取 metadata（見 `troubleshooting.md`）。

## 改「不適用」格
- 編 `content-relevance.yaml` 的 `inapplicable:` 區：增/減某領域的不適用年齡。
- 拿掉某年齡 → 該格從「不適用」變成可貢獻的「＋」（並受覆蓋率測試要求補內容）。

---

## 處理貢獻 / 修改 / 刪除 issue（維護者流程）
使用者在 `/education/` 按 ＋/✏️/🗑️ 送出 → Cloudflare Worker 開 GitHub issue（label `education-contribution` + `youtube`/`article`/`external-link`/`edit-article`/`delete-article`/`delete-video`）。維護者：
1. 讀 issue（含目標 slug/videoId、情境 領域×年齡、提議內容或刪除原因，body 內有「維護者操作區」提示）。
2. 判斷後**手動套用**：依上面對應的「新增/修改/刪除」步驟改 `content-relevance.yaml`（+ `.md` / `video-catalog`）。
3. `pnpm build && pnpm test --run` → commit → push → 部署（見 `deploy.md`）。
4. 關閉 issue。
> Worker 只負責「開 issue」，不會自動改資料 —— 臨床內容一律由維護者判斷後套用。
