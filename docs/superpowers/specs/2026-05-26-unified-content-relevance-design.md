# 統一衛教內容關聯系統 — 設計文件

**日期**: 2026-05-26
**狀態**: 設計中，待用戶 review
**相關**: `src/data/education-videos/`, `src/data/recommendations/`, `src/lib/education/`, `src/lib/db/recommendations.ts`, `scripts/build-video-index.ts`

---

## 背景與問題

經全 codebase 掃描，目前「內容 ↔ 情境」對應**散在 6 處活的來源 + 死代碼 + 孤兒內容**，同一篇文章在多處各登記一次，沒有單一真相源：

| # | 對應來源 | 軸 / 形式 | 狀態 |
|---|----------|-----------|------|
| ① | `data/education-videos/cdsa-domains.yaml` | 領域 × 年齡（矩陣 + 觸發） | 活 |
| ② | `data/recommendations/default.json` + `lib/db/recommendations.ts` | 分流類別 × 領域（無年齡）+ 租戶 overlay | 活 |
| ③ | `data/education-videos/cdsa-triage.yaml`、`cdss-vital-signs.yaml` | trigger（triage / cdss 生理） | 活 |
| ④ | `engine/closed-loop.ts` `getEducationRecommendations` | **硬寫** `{sugar_intake→diet-control, sleep_quality→sleep-hygiene, spo2→respiratory-care, activity_level→exercise-guide}` | 活 |
| ⑤ | `components/settings/RecommendationsManager.svelte:45-49` | **硬寫** 15 個 slug 清單（設定 UI 可選項） | 活 |
| ⑥ | `lib/education/trigger-derivation.ts` | **硬寫** `KNOWN_DOMAINS` / `KNOWN_INDICATORS` 兩份清單 + 組 trigger 字串 | 活 |
| — | `data/curate/inapplicable-matrix.json` | 哪些 領域×年齡 不適用 | 活 |
| 🗑️ | `components/education/EducationRecommend.svelte` | `CONTENT_META` 指向 5 個不存在的 slug，無任何 import | **死代碼** |
| 📄 | `data/education/milestones/*.md`（5 篇） | 不在任何對應裡 | 孤兒 |
| 🏥 | `lib/db/custom-education.ts`（IndexedDB `customEducation` 表） | 租戶自訂內容，自帶 category/domain/ageGroup/indicators | 活（租戶層） |

**痛點**：`gross-motor-activities` 同時登記在 ①、②、⑤；`diet-control` 在 ②③④。改一處忘其他就不一致。`KNOWN_DOMAINS`（⑥）和領域 enum（`schemas.ts`）、`closed-loop` 的 indicator map（④）各自為政。這是「每次加新功能就多一套設定、不管以前」累積出來的典型結果。

---

## 已確認決策

- **D1**：單一真相源涵蓋**全部三視圖**（矩陣瀏覽 / 評估後推薦 / 觸發影片），含發展領域與臨床（CDSS 生理警示 + 轉介）。
- **D2**：租戶自訂**只保留在「評估後推薦」層**；矩陣與觸發影片是全站共用基底，不可租戶覆寫。
- **D3**：評估後推薦**改為看年齡**（依小孩年齡只送適齡內容）。這使「領域×年齡×嚴重度」一套座標就能驅動三視圖。
- **D4**：採**方向 B — 單一中央關聯檔**。`default.json` 刪除、其資料折入單一源；①③ 的 yaml 收斂為同一份；三視圖全部從它投影。

---

## 架構：單一真相源 → 編譯 → 三投影

```
單一來源（內容導向，每筆內容只宣告一次）
        │  scripts/build-content-index.ts（取代 build-video-index.ts）
        ▼
public/data/content-index.json（編譯產物，含 catalog + 關聯）
        │
   ┌────┴─────────────┬──────────────────────┐
   ▼                  ▼                       ▼
矩陣瀏覽           評估後推薦                觸發影片
(領域×年齡)     (領域×年齡×嚴重度          (trigger 查找)
零 JS Astro      + 租戶 overlay)           video-lookup
                 ResultView/EducationMatch  TriggerVideoList
```

### 單一來源（內容導向）

每個內容項目（文章或影片）**只宣告一次**它的關聯，用多值陣列取代「一格一列」的重複：

```yaml
# src/data/education/content-relevance.yaml（唯一關聯真相源，含「不適用」定義）
inapplicable:                 # 哪些 領域×年齡 不評估（取代 inapplicable-matrix.json）
  behavior: [2-6m, 7-12m]
  fine_motor: [2-6m]
  language: [2-6m]
  cognition: [2-6m, 7-12m]
  language_comprehension: [2-6m]
  language_expression: [2-6m, 7-12m]
  social_emotional: [2-6m]
  # gross_motor：無（全年齡適用）

relevance:                    # 每個內容項目只宣告一次
  - ref: { type: article, slug: gross-motor-activities }
    cdsa:
      domains: [gross_motor]
      ageGroups: [2-6m, 7-12m, 13-24m, 25-36m, 37-48m, 49-60m, 61-72m]
      severities: [monitor, refer]   # 哪些分流結果適用（normal/monitor/refer）

  - ref: { type: article, slug: when-to-seek-help }
    cdsa: { domains: [all], severities: [refer] }
    clinical: [cdsa.triage.refer.*]  # 臨床觸發（cdss/triage trigger 字串，支援 * 萬用）

  - ref: { type: article, slug: respiratory-care }
    clinical: [cdss.respiratory_rate.critical.*]

  - ref: { type: video, videoId: yzRi9GlSptM }
    cdsa: { domains: [language], ageGroups: [13-24m] }
```

### 「一個檔」的邊界（100% 承諾）

**所有「內容 ↔ 情境」的關聯、嚴重度、臨床觸發、不適用定義 —— 100% 只在 `content-relevance.yaml` 這一個檔。** 沒有第二個關聯檔，`default.json` 與三份 education-videos yaml、`inapplicable-matrix.json` 全部刪除。

唯一留在別處的，是**內容項目自己的事實資料**（不是關聯）：
- 文章本文 → `src/data/education/*.md`（文章的內容）
- 影片事實 → `src/data/video-catalog/*.yaml`（標題/頻道/時長/驗證狀態，等同 YouTube 的客觀 metadata）

判準很簡單：**「這篇/這支該出現在哪」= 關聯 = 進唯一檔；「這篇/這支本身是什麼」= 內容自己的資料 = 留在內容檔。** 新增或搬移一篇文章的出現位置，永遠只改 `content-relevance.yaml` 一處。

### 三視圖投影邏輯（純函式，可單測）

- **矩陣瀏覽**：對每個 (domain, age) cell，收集 `cdsa.domains ∋ domain && ageGroups ∋ age` 的內容（不分嚴重度）。
- **評估後推薦**：給 (anomalousDomain, childAge, triageCategory)，收集 `domains∋d && ageGroups∋age && severities∋category` 的文章，**再疊租戶 overlay**。
- **觸發影片**：給 trigger 字串，收集 `clinical` 命中該 trigger（或 cdsa 投影出的對應 trigger）的影片。

### 租戶 overlay（只在推薦層）

- 沿用現有 IndexedDB overlay 機制，但 key 改為 `tenant::category::domain::ageGroup`（加入年齡，配合 D3）。
- overlay 疊在「評估後推薦」投影結果上（預設清單 + 租戶增減），矩陣/觸發不受影響。

---

## 遷移（重點：清掉現有三套，不留殘骸）

| 現有檔案 | 動作 |
|----------|------|
| `src/data/recommendations/default.json` | **刪除**；內容折入 `content-relevance.yaml` 的 `severities` 標記 |
| `src/data/education-videos/cdsa-domains.yaml` | **遷移**進 `content-relevance.yaml` 後刪除 |
| `src/data/education-videos/cdsa-triage.yaml` | **遷移**進 `clinical` 後刪除 |
| `src/data/education-videos/cdss-vital-signs.yaml` | **遷移**進 `clinical` 後刪除 |
| `scripts/curate/inapplicable-matrix.json` | **遷移**進 `content-relevance.yaml` 的 `inapplicable` 區後刪除 |
| `scripts/build-video-index.ts` | 改寫為 `scripts/build-content-index.ts`，產出 `content-index.json` |
| `public/data/video-index.json` | 由 `content-index.json` 取代（更新所有 import） |
| `src/lib/db/recommendations.ts` | 改寫：投影自 content-index + 套 overlay（年齡感知） |
| `src/lib/education/matrix-data.ts` | 改為投影自 content-index |
| `src/lib/education/video-lookup.ts` | 改為投影自 content-index |
| `src/lib/education/schemas.ts` | 更新 schema（content-relevance + 新 runtime index）；領域/指標 enum 成為**唯一** enum 源 |
| `src/engine/closed-loop.ts` ④ | **移除**硬寫的 `getEducationRecommendations` indicator→slug map，改呼叫 content-index 的 clinical 投影 |
| `src/components/settings/RecommendationsManager.svelte` ⑤ | **移除**硬寫的 15-slug 清單，改從 content-index 取「可選內容」 |
| `src/lib/education/trigger-derivation.ts` ⑥ | 保留「情境→trigger 字串」邏輯，但 `KNOWN_DOMAINS`/`KNOWN_INDICATORS` 改從 `schemas.ts` 單一 enum 源匯入（不再各自硬寫） |
| `src/components/education/EducationRecommend.svelte` 🗑️ | **刪除**（死代碼，無 import、指向不存在 slug） |
| `src/data/education/milestones/*.md` 📄 | 在 `content-relevance.yaml` 補上 relevance（依年齡），否則維持孤兒；**預設補上** |
| `src/lib/db/custom-education.ts` + `schema.ts` 🏥 | 租戶自訂內容併入「推薦投影」；overlay/custom key 加 `ageGroup`（配合 D3）。runtime 投影函式需把 default + custom + overlay 合併 |
| `src/content.config.ts` | education frontmatter 不變（關聯不放 frontmatter，維持方向 B） |
| 消費端 | `index.astro`、`ResultView`/`ResultViewWrapper`/`EducationMatch`、`TriggerVideoList`/`EducationRelatedVideos`、`PatientList`/`ResultDetail`、`CustomEducationList`、`[...slug].astro`、`RecommendationsManager` 全部改接新投影 API |

遷移驗證：build 後比對「遷移前 video-index.json + default.json 表達的關聯」與「遷移後 content-index.json 投影結果」逐筆一致（migration parity test），確保沒有任何內容掉落或改變行為（除 D3 年齡感知為刻意行為變更）。

---

## 不在本次範圍

- 不改文章本文內容、不改影片 catalog metadata。
- 不改 CDSA 評估演算法、triage 計算、FHIR 流程。
- 不新增內容（純策展是另一條工作）。
- 不把租戶自訂擴大到矩陣/觸發（D2 維持現狀）。

---

## 成功標準

1. `content-relevance.yaml` 是唯一宣告「內容 ↔ 情境」的地方；新增/搬移一篇文章只改這一處。
2. **關聯資料 100% 在 `content-relevance.yaml` 一處**：①②③ 的資料檔（`default.json`、三份 education-videos yaml）、`inapplicable-matrix.json` 全部刪除；④⑤ 的硬寫 map/清單移除改讀投影；⑥ 的 enum 改從 `schemas.ts` 單一源匯入；死代碼 `EducationRecommend.svelte` 刪除。
   - 釐清：**關聯**（誰出現在哪）→ `content-relevance.yaml`；**分類法 enum**（領域/年齡/嚴重度/指標清單）→ `schemas.ts` 單一源；**內容自身事實** → `.md` / `video-catalog`。三者各有唯一源，互不重複。
3. 三視圖行為：矩陣（10 不適用 / 其餘可貢獻，現有內容如實顯示）、推薦（年齡感知 + 租戶 overlay 仍可用）、觸發影片（與遷移前一致）。
4. migration parity test 通過：除年齡感知外，關聯關係與遷移前等價。
