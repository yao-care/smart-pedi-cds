# 兒童發展評估計分統一為常模參照（Questionnaire Norms）— Design

- **日期**: 2026-05-28（§7 拍板：2026-05-28；§13 補拍：2026-05-28 同日）
- **狀態**: §7 全部拍板，可以執行 Phase 1（已先完成「rename 名稱統一」commit `bc56ecd`）
- **承接自**: SEO/AEO 改造完成並部署上線後（main `f2b8597`），用戶在驗收時發現雷達圖／建議閱讀的判讀矛盾，深入診斷指向評估引擎計分基準混用，搜尋業界共識後用戶選擇「直接走正解」。
- **本文件為 /clear 前的完整交接**：自包含、不依賴對話 context。

---

## 1. 背景與問題現象

使用者報告 `/result/?id=...` 頁面的「建議閱讀」幾乎把所有內容都呈現，且雷達圖某些領域顯示 `50`（標示為「同齡平均」）卻被判「需注意」。深入查證後確認**非 SEO 改造造成**（git 證據：相關評估引擎檔案我這次 0 改動），是更深層的計分基準矛盾。

## 2. 根因（已從程式碼確認，附行號）

評估引擎**混用兩種計分基準**，但雷達圖把它們畫在同一個 0–100 刻度 + 「50 = 同齡平均」legend：

| 領域／資料來源 | 雷達分數算法 | 是 | 「需注意」(isAnomaly) 門檻 | 程式位置 |
|---|---|---|---|---|
| 各領域**問卷分數** | `round(得分率 × 100)` | **得分率**（無常模） | `normalized < 0.5`（得分未達滿分一半） | `radar-scoring.ts:36,48` / `triage.ts:174` |
| **行為**（遊戲互動 4 指標：completionRate / operationConsistency / reactionLatency / interactionRhythm） | z→常態 CDF | **常模百分位** | `effectiveZ ≥ 1.5 SD` | `radar-scoring.ts:49-50` / `triage.ts:116` |
| **細動作**（繪圖 drawingScore） | 同上，常模百分位 | **常模百分位** | `drawingZ ≤ −1.5 SD` | `triage.ts:131` |
| **語言**（語音時長 voiceDuration） | 同上，常模百分位 | **常模百分位** | `voiceZ ≤ −1.5 SD` | `triage.ts:146` |
| **粗動作**（poseClassification） | 無連續分數 → 預設 50 | **分類**（二元） | `classification === 'delayed'` | `triage.ts:187` |
| 同領域同時有問卷+z（hybrid ⚖） | 兩者百分比平均 | 混合 | 各自門檻 | `radar-scoring.ts:51-54` |

**矛盾來源**：
1. **legend 名不副實**：問卷領域的 `50` 是「答對一半」（得分率），不是「同齡第 50 百分位」。對 ASQ-3 等業界工具來說，發展評估的「平均」必然是常模參照，不是得分率。
2. **門檻撞點**：問卷 `isAnomaly` 門檻（得分率 0.5）剛好等於雷達的「50」刻度。得分率略低於半（如 0.49）→ 雷達顯示 ≈50（使用者以為平均、正常）→ 卻被判需注意 → 「建議閱讀」對該領域疊上推薦。
3. **多領域疊加**：若多領域得分剛好略低於一半（常見），全判 `isAnomaly` → 雷達都顯示 ≈50 → `EducationMatch` 對每個異常領域取推薦（每 (severity::domain::age) 取 1–3 篇）→ 跨多領域疊加去重後接近全部 11 篇（refer 級涉及的 slug 數）。

## 3. 業界標準（已 WebSearch 確認，2026-05 搜尋）

幾乎所有標準化發展篩檢/評估工具一致用**常模參照**（norm-referenced），非得分率：

- **ASQ-3**（最廣用的家長篩檢問卷）：
  - **cutoff = 同齡 mean − 2 SD**（≈ 第 2.5 百分位）= 轉介（referral）
  - **mean − 1～2 SD = monitoring（追蹤）區**
  - 完全不看「答對幾%」，看「跟同齡常模比，落後幾個 SD」
  - Technical Appendix 提供 21 個年齡區間 × 5 個面向的 mean/SD/cutoff 表
- **DAYC-2 / Bayley / Peabody (PDMS) / Griffiths**：各面向都轉**標準分數（standard score）/百分位/scaled score**，再跟同齡常模比；臨床門檻用百分位（如 `≤5th percentile` = 明確遲緩）。

**核心共識**：發展評估的多面向判讀，標準做法是**常模參照（標準分數或百分位）+ SD-based cutoff**。得分率（答對幾%）不具跨面向臨床意義，因為題目難度不一、不能跨面向比較、無法判斷發展是否相對落後。

業界三級分流模型（與本系統的 normal / monitor / refer 天然對應）：
- **正常** = 高於 −1 SD（≈ 百分位 > 16）
- **追蹤觀察** = −1 ~ −2 SD（≈ 百分位 2.5 ~ 16）
- **建議轉介** = 低於 −2 SD（≈ 百分位 < 2.5）

## 4. 目標

**問卷面向補同齡常模，全面向統一走常模參照 + SD cutoff。**

具體：
1. **雷達圖**：所有面向都顯示「同齡常模百分位」（含問卷領域），legend「50 = 同齡平均」名實相符。
2. **isAnomaly**：所有面向統一用 SD 門檻判定，消除「50 卻需注意」的視覺矛盾。
3. **三級分流**：依 ASQ-3 模型，−1/−2 SD 為門檻（具體值待臨床拍板）。

## 5. 範疇與相關檔案

### 5.1 評估引擎程式碼（要動的）

| 檔案 | 改動 |
|---|---|
| `src/engine/cdsa/triage.ts` | 問卷分數判定改用 z-score，`isAnomaly` 改為 SD 門檻；三級分流邏輯（line 197-213）可能需調整門檻 |
| `src/engine/cdsa/radar-scoring.ts` | 主邏輯不必動（line 49-50 z 路徑已存在），但問卷 detail 需有 `directionalZ` 才能走 z 路徑 |
| `src/lib/db/schema.ts` | `TriageDetail` 型別已含 `zScore`/`directionalZ`/`normMean`/`normStd`，無需擴；確認 IndexedDB schema 是否需要 bump version（看是否 breaking） |
| `src/components/assess/ResultView.svelte` | `anomalyDomains` 計算（line 80-82）邏輯不變，但行為會跟著 isAnomaly 改變 |
| `src/components/assess/EducationMatch.svelte` | 不必動（讀 recommendations 與此修正解耦） |
| `src/components/assess/RadarChart.svelte` | 不必動（雷達分數計算在 radar-scoring，元件只渲染；標籤佈局上次已修） |
| `src/lib/fhir/cdsa-resources.ts:88` | `detail.zScore` 序列化現在問卷也會有值，確認 FHIR 輸出不受影響 |

### 5.2 既有常模資料位置

- **`NORMS` 常數**（在 `triage.ts` 內 import）：給 `drawingScore` / `voiceDuration` / `completionRate` / `operationConsistency` / `reactionLatency` / `interactionRhythm`。位置需 `grep -n "NORMS\b" src/engine/cdsa/triage.ts` 確認 import 來源。
- **`src/data/baselines/pediatric-baselines.json`**：是**生理徵象**（heart_rate / spo2 等）的常模，**不是發展問卷**。
- **問卷面向常模：缺**（用戶確認過：問卷只有 `score` / `maxScore`，沒有同齡 mean/SD）。

### 5.3 新增資料

- **`src/data/baselines/questionnaire-norms.json`**（建議檔名與位置；亦可改 yaml + content collection）
- 結構（建議）：
  ```json
  {
    "behavior": {
      "13-24m": { "mean": ..., "std": ..., "n": ..., "source": "..." },
      "25-36m": { ... },
      ...
    },
    "gross_motor": { ... },
    "fine_motor": { ... },
    "language_comprehension": { ... },
    "language_expression": { ... },
    "cognition": { ... },
    "social_emotional": { ... }
  }
  ```
- 需涵蓋所有問卷 domain × 7 個年齡組（`2-6m` / `7-12m` / `13-24m` / `25-36m` / `37-48m` / `49-60m` / `61-72m`，定義於 `src/lib/utils/age-groups.ts` 的 `AGE_GROUPS_CDSA`）。
- 問卷 domain 實際 **6 個**（`triage.ts:7-10` `KNOWN_QUESTIONNAIRE_DOMAINS`）：`cognition` / `fine_motor` / `gross_motor` / `language_comprehension` / `language_expression` / `social_emotional`；加上 z 模組的 `behavior`（行為遊戲）與 `language`（語音時長）共 **7 個** radar domain。**spec 早期錯寫 8 領域，以實際 6 為準**。
- `source` 欄位記常模來源（透明化）：`'asq3-borrowed'` / `'nhi-checklist'` / `'internal-platform'` 等。

### 5.4 測試

| 檔案 | 改動 |
|---|---|
| `tests/engine/triage.test.ts` | 反映新的 isAnomaly z-based 邏輯；確認問卷常模未配置時的 fallback 行為 |
| `tests/engine/radar-scoring.test.ts` | 確認問卷領域現在走 z 路徑（`hybrid=false` 仍可能、依資料） |
| `tests/engine/assessment-analyzer.test.ts` | 整合層：確認三級分流依新門檻 |
| 新增：`tests/data/questionnaire-norms.test.ts` | 常模資料完整性（每面向 × 每年齡都有 mean/std） |

### 5.5 文案/呈現對齊

- **`src/pages/about.astro` line 23-29**：目前「評估判讀流程」第 3 步寫「問卷面向得分未達滿分的一半」/「行為／繪圖／語音明顯偏離同齡常模（約 1.5 個標準差）」/「動作經 AI 姿態分析判讀為疑似遲緩」。**新版需統一為**「比同齡常模落後 1 個標準差以上」之類（與 SD 門檻對齊）。
- **`src/pages/index.astro` line 21**：trust 區「題目參考通用發展里程碑編寫，並經兒科專業人員審閱（2026-05）」——若常模來源選 ASQ-3 借用或內部資料，需在此或 about 補一句常模來源透明聲明。
- **legend**：`RadarChart.svelte` legend「50 = 同齡平均」對所有面向都成立後，保持現狀即可，**不必動**。

## 6. 具體步驟（分階段）

### Phase 0：解決 §7 待決事項（**前置條件，未完成前不要進 Phase 1**）

### Phase 1：問卷常模資料建立

1. 依 Phase 0 決策結果，建立 `src/data/baselines/questionnaire-norms.json`。
2. 若資料不全（某面向 × 某年齡缺），於檔內以 `null` 或省略明標；triage 需有對應 fallback 處理（見 §7 待決 4）。
3. 在 `src/content.config.ts` 加 questionnaire-norms collection（或直接 import json）。
4. 寫常模完整性測試（每 domain × 每 age 都有）。
5. commit：`feat(norms): 新增問卷面向常模資料（來源：...）`

### Phase 2：triage 改寫問卷判定（z-based）

修改 `src/engine/cdsa/triage.ts:161-177`（問卷區塊）為類似：

```ts
import { questionnaireNorms } from '...';

if (input.questionnaireScores) {
  for (const [domain, score] of Object.entries(input.questionnaireScores)) {
    const maxScore = input.questionnaireMaxScores?.[domain] ?? 10;
    const norm = questionnaireNorms[domain]?.[input.ageGroup];

    if (norm && norm.std > 0) {
      // 常模參照：z-score（與其他模組同向：負 = 比常模差）
      const z = (score - norm.mean) / norm.std;
      details.push({
        domain,
        metric: 'questionnaireScore',
        value: score,
        maxScore,
        zScore: z,
        directionalZ: z, // 負 = 比常模差，與 drawing/voice 一致
        normMean: norm.mean,
        normStd: norm.std,
        isAnomaly: z <= -1.5, // 比照其他模組門檻（具體值依 §7 拍板）
      });
    } else {
      // Fallback（依 §7 待決 4 決策）：保守選項 = 暫不 push 該 detail，
      // 並記錄 console.warn 提示常模缺失；triage 結果不把該面向算進 anomalyCount
      console.warn(`[triage] no norm for ${domain}::${input.ageGroup}, skip`);
    }
  }
}
```

更新三級分流門檻（`triage.ts:201-213`）若與新基準需校準（如 SD 累積邏輯，比照 ASQ-3：任一面向 < −2 SD = refer；任一面向 −1～−2 SD = monitor）。**具體門檻策略需臨床拍板**。

commit：`refactor(triage): 問卷判定改用常模 z-score，統一三級分流為 SD 門檻`

### Phase 3：radar-scoring 自動轉百分位（多半不必改）

`radar-scoring.ts:38-40` 的 z 路徑已存在；問卷 detail 現在有 `directionalZ` → 自動走 z 路徑（line 49-50 zToPercentile）→ 輸出百分位。

需確認：
- 舊路徑（line 35-37 `rawSum` 給 `questionnaireScore`）**還要不要保留**？
  - 保留作為「無常模時的 fallback」較穩健（與 §7 待決 4 一致）。
  - 但若 Phase 2 已決定無常模就 skip detail，這路徑可能永遠用不到 → 可刪。

commit（若需）：`refactor(radar): 移除問卷得分率分支（統一走 z 百分位）`

### Phase 4：文案/呈現對齊

- 改 `about.astro`「評估判讀流程」第 3 步文案（見 §5.5）。
- 視 §7 決策補常模來源聲明（`about.astro` 或 `index.astro`）。
- legend 不動。

commit：`docs(about): 評估判讀流程文案統一為常模 SD 門檻`

### Phase 5：FHIR / IndexedDB 相容

- `src/lib/fhir/cdsa-resources.ts:88` 序列化檢查（`detail.isAnomaly ? 'A' : 'N'` 不變；`zScore` 現在問卷也有值，下游若有用要確認）。
- IndexedDB 舊評估資料：詳見 §7 待決 3。

### Phase 6：測試與守門

- 跑 `pnpm test` 全綠；更新 `tests/engine/{triage,radar-scoring,assessment-analyzer}.test.ts`。
- 新增常模完整性測試。
- `pnpm build` 守門 6 項過。

### Phase 7：人工驗證

- 用一筆「全領域問卷分數約半」的測試資料：
  - 舊行為：雷達多領域 ≈50、isAnomaly 全 true、建議閱讀疊加多領域。
  - 新行為：雷達顯示真實同齡百分位（≈50 表示確實平均）、isAnomaly 多數 false、建議閱讀只列真正落後的領域。
- 截圖比對 before/after，請臨床確認判讀合理。

## 7. 待決事項（**全部已拍板，2026-05-28**）

> **拍板紀錄（依此執行 Phase 1，下次 session 不必重問）**
> - §7.1 = **A. ASQ-3 借用**（資料源：ASQ-3 User's Guide Table 18，page 171，PDF 已存：https://agesandstages.com/wp-content/uploads/2019/08/ASQ-3-Technical-Appendix_web.pdf）
> - §7.2 = **per-domain z 合成 + ASQ-3 cutoff**（業界正解 D 方案）。每 domain 合成 domain-level z = mean(directionalZ of all details in domain)；refer = 任一 domain z ≤ -2 SD；monitor = 任一 domain z ≤ -1 SD（無 refer）；normal = 所有 domain z > -1 SD。per-detail isAnomaly 改為「detail.directionalZ ≤ -1 SD」僅作 UI 提示，不參與 gating。配套：about.astro 透明標示
> - §7.3 = **重算所有舊評估**（重算前置已驗證可行：`Assessment.triageResult.details.value` + `maxScore` + `Child.birthDate` + `Assessment.completedAt` 足夠推回當時 ageGroup → z-score；不需要原始 input）
> - §7.4 = **B. 顯示但灰格警告**（雷達畫但不算 anomaly count，UI 標「資料不足」）

### 7.1 問卷常模從哪來？

| 選項 | 描述 | 優 | 缺 |
|---|---|---|---|
| **A. ASQ-3 借用** | 參考 ASQ-3 Technical Appendix 各年齡 × 5 面向的 mean/SD | 國際標準、有公開資料 | 題目不完全相同→對應可能不準；ASQ-3 5 面向 vs 本系統 8 領域有 mapping 問題 |
| **B. 國健署「學前兒童發展檢核表」常模** | 較貼近台灣兒童母體 | 在地常模、權威 | 需確認該檢核表的 mean/SD 是否公開可用 |
| **C. 內部資料建模** | 用 yao.care 平台累積評估資料計算 mean/SD | 與本系統題目完全相符 | 資料量需足夠、樣本可能有自選偏差（自評家長未必代表母體）；需排除已轉介族群 |
| **D. 混合** | 起步用 A 或 B，逐步累積內部資料校正 | 務實 | 過渡期需透明說明 |

**建議**：請臨床顧問拍板。若無法立即決定，先用 A（ASQ-3 借用）起步，標示「常模來源：ASQ-3 國際參考值」，未來再校正。**這個決定影響 Phase 1 整個資料工程。**

### 7.2 三級分流的 SD 門檻精確值

**※ 已拍板（2026-05-28）：per-domain z 合成 + ASQ-3 cutoff（業界 Bayley / Battelle / DAYC-2 對齊）**
- per-detail z 仍計算（給雷達 hover 用，UI 不變）
- 每個 domain 合成 domain-level z = mean(directionalZ of all details in domain)
- gating：
  - **refer** = 任一 domain-level z ≤ -2 SD
  - **monitor** = 任一 domain-level z ≤ -1 SD（但無 refer）
  - **normal** = 所有 domain z > -1 SD
- per-detail isAnomaly 改為提示性質：`detail.directionalZ ≤ -1 SD`（不參與 gating）

**為什麼改 per-domain（spec 原本拍板 §8 不改 gating，後因「業界正解」討論再拍板擴大範疇）**：

本系統 `behavior` domain 有 4 個 z 指標（completionRate / operationConsistency / reactionLatency / interactionRhythm）、`fine_motor` 有 2 個（drawing + 問卷）、`language` 有 2-3 個（voice + 問卷理解 + 問卷表達），共 12+ metric。若直接 per-metric 套 ASQ-3 cutoff：
- 「任一 metric ≤ -2 SD = refer」會放大 false positive（單 domain 內 4 個獨立 metric 機會）
- 「anomalyCount ≥ 3 metric ≤ -2 SD = refer」會 under-refer（需 3 個 metric 同時極低，統計上 P ≈ 0.2%）

業界 multi-area 篩檢工具（ASQ-3 / Bayley / Battelle / DAYC-2）都是 **per-area 判讀**：area 內多 items 合成一個 score，cutoff 套在 area total。本系統的 per-metric 是設計時的非標準選擇，per-domain 合成是回歸業界標準。

**舊規劃（已過時，留歷史）**：
- isAnomaly（單一 metric 需注意）：z ≤ −1 SD（較寬，列為 monitor 候選）
- refer 條件：任一 metric z ≤ −2 SD，**或** 累積跨多 domain ≥N 個 metric ≤ −1.5 SD
- normal：所有 z > −1 SD

**需臨床拍板具體數字**。可參考 ASQ-3 但本系統有多個資料來源（問卷+z 模組），門檻策略要設計。

### 7.3 舊評估資料（IndexedDB）處理

既有評估存的是 `triageResult`（含 `details`，每個有 `isAnomaly`、`zScore`）。新邏輯實作後：
- **選項 1：保持原樣**——舊評估的雷達/判讀依當時計算結果顯示，不重算。下個評估才走新邏輯。
- **選項 2：重算**——需要原始 input（`assessment input`），若 IndexedDB 也有存原始 input 則可重算；若只存 result 則無法重算。

需查 `src/lib/db/schema.ts` 看 IndexedDB 是否存原始 input。**建議選項 1（向後相容、不重算），加 `schemaVersion` 標示新舊**。

### 7.4 無常模 fallback 策略

若某 (domain, ageGroup) 無常模資料：
- **A. Skip**：不 push 該 detail，使用者完全看不到該面向（雷達也不畫）。優：嚴謹；缺：UX 差（突然消失一格）。
- **B. 顯示但標警告**：雷達顯示「資料不足」灰格，不算進 anomaly count。優：透明；缺：UI 需設計。
- **C. 退回得分率**：與目前邏輯一致，但只用於該情境。優：UX 連續；缺：又混回兩套基準。

**建議 B**：常模不全時顯示但明確告知，不誤判 anomaly。但要設計 UI。

## 8. 不在範疇

- 重新設計問卷題目（保留原題目，只補常模）。
- 修改影片 catalog / 衛教文章內容（內容層獨立）。
- 修改 SEO/AEO 基建（已完成、已部署）。
- ~~重新設計三級分流的演算法結構（只調整門檻數字，不改 anomalyCount/anomalyDomainCount 的 gating 機制）。~~ **2026-05-28 後修正：per-metric → per-domain gating 改造已納入範疇（見 §7.2 修訂），仍不重設整套演算結構，僅把 metric-level isAnomaly 改為 domain-level z 合成判讀。**

## 9. 風險與緩解

| 風險 | 緩解 |
|---|---|
| 常模來源不權威 → 臨床信效度疑慮 | §7.1 由臨床顧問拍板來源；transparent 標示來源於對外文案 |
| 常模缺漏導致大量 fallback | §7.4 明確 fallback 策略；常模完整性測試 |
| 改完後判讀結果與舊版差異大，使用者困惑 | 加 schemaVersion；對舊評估保持原樣（§7.3）；新評估有明顯版本標示 |
| 內部資料常模有自選偏差 | §7.1 若選 C，需臨床審視樣本代表性；過渡期混用 A/B 校正 |

## 10. 業界參考 sources（已搜尋確認）

- ASQ-3：得分 → 百分位換算說明：https://support.agesandstages.com/kb/article/420-can-the-asq3-scores-be-translated-into-percentile-rank-and-if-so-what-is-that-percentile/
- ASQ-3 Technical Appendix（mean/SD 表完整 21 區間 × 5 面向）：https://agesandstages.com/wp-content/uploads/2019/08/ASQ-3-Technical-Appendix_web.pdf
- ASQ-3 monitoring/referral zones cutoff 說明：https://support.agesandstages.com/kb/article/407-where-can-i-find-a-list-of-the-cutoff-scores-for-the-monitoring-and-referral-zones-for-all-asq3-intervals/
- Peabody PDMS 標準分數/百分位：https://www.sprypt.com/fot/the-peabody-developmental-motor-scales

## 11. 這次 session 的全部 commit 與部署狀態（接續參考）

main 分支已 push 到 origin/main 並部署上線（GitHub Pages 自訂域名 `https://smart-pedi-cds.yao.care`）。

| Commit | 性質 |
|---|---|
| `e30d910` `3d4844d` | SEO/AEO spec 與計畫 |
| `d340cfd` … `63cc0ec` | Phase 1-8 SEO/AEO 24 task + 清理 |
| `daab947` | Merge feat/seo-aeo 到 main |
| `ae1d259` | fix(ci): 補 `build:video-index` script alias，修復 pre-existing CI failure |
| `462bbb8` | fix(seo): 不 build 孤兒食譜文章頁 |
| `8d8dc7a` | fix(seo): 對外只主打系統核心文章 + 還原 nav 評估紀錄 |
| `8688018` | feat(education): 矩陣每格列出該情境**所有**相關文章（不只主文章） |
| `f2b8597` | fix(radar): 雷達圖標籤與分數重疊修正（既有元件 bug，非 SEO 改造引入） |
| `bc56ecd` | rename: 系統名稱統一為「Smart Pedi 兒童發展評估」（本 spec 動工前的 prerequisite，2026-05-28 與 §7 拍板同日完成） |

衛教內容治理：
- 系統核心文章 = `content-relevance.yaml` 中 `browse:true` 的 8 篇（六大發展領域主衛教）
- 矩陣文章 = 被任一 trigger 對應的 13 篇（核心 8 + 補充 5：diet-control / exercise-guide / respiratory-care / sleep-hygiene / when-to-seek-help）
- 孤兒 5 篇 `nutrition-*`（秋葵料理等）已從 dist 排除（getStaticPaths filter）→ 不在 sitemap、不被 Pagefind 索引、頁面 source 無食譜全文
- `src/lib/education/core-articles.ts` 為共用判準：`CORE_ARTICLE_SLUGS`（browse 8 篇）+ `MATRIX_ARTICLE_SLUGS`（被 trigger 對應的 13 篇）

## 12. 給下次 session 的開頭指引

1. 讀本 spec（`docs/superpowers/specs/2026-05-28-questionnaire-norms-design.md`）。
2. §7 已全部拍板（§7.1/7.2/7.3/7.4），可直接進 Phase 1。
3. 依 §6 Phase 1 起執行，每 Phase 各自 commit。
4. **§13 是 Phase 1 動工前必讀的工程細節（核心粒度問題 + ASQ-3 mapping 設計），動工前要先了解。**
5. 注意：評估引擎涉及臨床判讀，**所有門檻/常模值都需用戶或臨床顧問拍板**，§7 已拍板的不再重問；新出現的細節（如 ASQ-3 Communication 拆 lang_comp/lang_exp 之外的替代方案）若涉臨床判讀仍需問用戶。

## 13. 2026-05-28 §7 拍板後新增工程細節（Phase 1 動工前必讀）

### 13.1 本系統題目粒度的核心限制

從 `src/data/questionnaire/questions.json` 統計（用 jq 跑過）：

| 維度 | 本系統 | ASQ-3 |
|---|---|---|
| 每 (domain × ageGroup) 題目數 | **1-2 題**（多為 2，少數 1） | 6 題 |
| 每題滿分 | 2（yes=2 / sometimes=1 / no=0） | 10（yes=10 / sometimes=5 / not yet=0） |
| (domain × ageGroup) maxScore | **2 或 4**（多為 4） | **60** |
| 得分離散值數 | 5 個（0/1/2/3/4） | 13 個（0/5/10/...) |

**含意**：直接「滿分比例縮放」(`mean_local = mean_asq/60 × maxScore_local`, `SD` 同理) 後，本系統「分數差 1 分 ≈ 跳 1.5-2 SD」。即「答對一半」(2/4) 在 ASQ-3 嚴格 -2 SD 門檻下會直接觸發 refer。

**用戶選擇**：仍維持 ASQ-3 嚴格 -2 SD，但配套：
- about.astro / index.astro 透明標示「本工具針對高敏感率（寧錯報不漏報）設計」
- 結果頁加「必要時請諮詢專業」出口（既有的醫療免責聲明可加強）

### 13.2 缺漏的 (domain × ageGroup) 格

本系統問卷有 4 格沒有題目：
- `cognition::2-6m`（嬰兒太小沒認知題）
- `language_expression::2-6m`（嬰兒太小沒表達題）

這跟「無常模 fallback」(§7.4) 不同——是「無題目導致無 score」，會自動跳過（沒 `questionnaireScores[domain]`），不會送進 triage。

但常模本身：ASQ-3 Table 18 對所有 5 面向 × 21 個 interval 都有資料。**所以實際上問卷常模 6 個 domain × 7 個 ageGroup = 42 格都會有常模可填**（只是 2-6m 的 cognition/lang_expression 沒題目所以用不到）。

### 13.3 ASQ-3 → CDSA mapping 設計

**21 個 ASQ-3 interval → 7 個 CDSA ageGroup**（取中位 interval）：

| CDSA ageGroup | 取用 ASQ-3 interval | 備註 |
|---|---|---|
| 2-6m | 4-month | |
| 7-12m | 10-month | |
| 13-24m | 18-month | |
| 25-36m | 30-month | |
| 37-48m | 42-month | |
| 49-60m | 54-month | |
| 61-72m | 60-month | ASQ-3 最大 60m，本系統 61-72m **超出 ASQ-3 範圍**，用 60-month 常模並在文案標明 |

**5 個 ASQ-3 area → 6 個 CDSA 問卷 domain**：

| CDSA domain | 對應 ASQ-3 area |
|---|---|
| `cognition` | Problem Solving |
| `fine_motor` | Fine Motor |
| `gross_motor` | Gross Motor |
| `social_emotional` | Personal-Social |
| `language_comprehension` | **Communication（共用）** |
| `language_expression` | **Communication（共用，同組）** |

ASQ-3 Communication 是「理解+表達」混在一起的單一面向。本系統把 lang_comp + lang_exp 拆為兩個 domain，**共用同一組 ASQ-3 Communication 常模**（簡化假設：兩 sub-domain 分佈相似）。未來換 PLS-5 / 內部資料校正時可拆。**這個假設要在文案透明標示。**

### 13.4 ASQ-3 Table 18 萃取方法

PDF 來源已存：https://agesandstages.com/wp-content/uploads/2019/08/ASQ-3-Technical-Appendix_web.pdf（page 171 是 Table 18，含 21 個 interval × 5 個面向 × 5 欄 `Mean / SD / 1.0 SD cutoff / 1.5 SD cutoff / 2.0 SD cutoff`）。

**抄錄 + 自動驗證方法**：每 cell 同時抄 `mean`、`SD`、`reported_2SD_cutoff` 三欄，寫一個測試自動驗證 `|mean - 2*SD - reported_cutoff| < 0.05`。任一 cell 失敗代表 OCR 抄錯，可立即定位。

Phase 1.1 只需萃取 7 個 row（4m, 10m, 18m, 30m, 42m, 54m, 60m）× 5 area × 3 col = 105 個數字。Phase 1 動工腳本（未來步驟）：
1. 萃取 → `src/data/baselines/asq3-table18-raw.json`（含三欄）
2. mapping + 縮放 → `src/data/baselines/questionnaire-norms.json`（最終本系統用）
3. cell-level cutoff verification 測試
4. 完整性測試（6 domain × 7 ageGroup = 42 格）

### 13.5 §7.3 IndexedDB 重算前置已驗證可行

從 `src/lib/db/schema.ts` 確認：
- `Assessment.triageResult.details` 每筆有 `value`（score）、`maxScore`、`domain`
- `Assessment.completedAt` + `Child.birthDate` 可推回「評估當時的 ageGroup」（用 `ageInMonths` 算到當時時間）

→ **重算 z-score 所需資訊都在 IndexedDB**，不需要原始 `TriageInput`。Phase 5 IndexedDB v6 upgrade tx 可用 `tx.table('assessments').modify(...)` 重算 details，並加 `schemaVersion: 2` 標示新版本。

### 13.6 §7.2 拍板過程紀錄

§7.2 在分析「本系統粒度粗」（§13.1）後**重新問過用戶**，用戶仍維持 ASQ-3 嚴格 -2 SD（理由：寧錯報不漏報），與最初拍板一致。文案層配套（高敏感率告知 + 出口）由 Phase 4 處理。
