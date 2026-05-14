# 4 頁面重新規劃 — 設計文件（v3）

## 修訂歷史

- v1（commit 82bd571）：原始 4 頁重設計
- v2（commit 821237e）：補 FHIR-vs-IndexedDB 雙來源 resolver
- v3（本版）：獨立 Opus 審查後修 3 Blocker + 6 Major + 7 Minor

## Context

E2E 測試後（2026-05-14）發現 4 個頁面在資訊架構與基本實作上有問題：

1. **評估結果頁** — 暴露 raw metric 給家長；雷達圖無多邊形；長頁面缺 hero 區。
2. **衛教列表** — 16 張卡平鋪、無分類篩選、format 視覺差異弱。
3. **圖卡審核** — 60 張縮圖全部空白（**根因確認**：webp 檔名含中文「-亮 / -透」，GitHub Pages 對 CJK URL encoding 處理不穩）；無 status / domain filter；標題用技術 ID。
4. **評估歷史** — 一行紀錄 + 大片空白，缺空狀態、PDF 重下、比較。

**PHI 聲明**：assessment id、child id 都是隨機 UUID v4，不含 PHI；URL query 攜帶 id 安全。FHIR Patient ID 為醫院隨機字串，不含 PII。

## 受眾分流原則

- **家長**（未登入 FHIR）：簡視 + 行動導向
- **醫師**（已登入 FHIR）：完整 metric + FHIR 操作

---

## 前置條件 1：FHIR identifier round-trip（**Blocker 修正**）

**現況**：`buildAssessmentObservations` / `buildTriageDiagnosticReport` 沒設 `identifier`，submit 後也沒寫回 FHIR resource id 到本地。導致醫師端無法用 UUID 反查 FHIR。

**修法**（必須在跨裝置功能前完成）：

1. **改 `src/lib/fhir/cdsa-resources.ts`**：
   ```ts
   const ASSESSMENT_SYSTEM = 'https://smart-pedi-cds.yao.care/assessment';

   buildAssessmentObservations(assessment, ...): FhirObservation[] {
     return details.map((d, i) => ({
       resourceType: 'Observation',
       identifier: [{ system: ASSESSMENT_SYSTEM, value: `${assessment.id}::${d.domain}::${d.metric}` }],
       code: {
         coding: [{ system: 'http://loinc.org', code: mapDomainToLoinc(d.domain) }],
         text: `CDSA ${d.domain}::${d.metric}`,  // machine-parseable; Major M3 修正
       },
       // ...其餘不變
     }));
   }

   buildTriageDiagnosticReport(assessment, ...): FhirDiagnosticReport {
     return {
       resourceType: 'DiagnosticReport',
       identifier: [{ system: ASSESSMENT_SYSTEM, value: assessment.id }],
       // ...其餘不變
     };
   }
   ```

2. **改 `src/lib/fhir/cdsa-submit.ts`**：成功 POST 後把 FHIR server 回的 DiagnosticReport.id 寫回本地：
   ```ts
   await db.assessments.update(assessment.id, {
     fhirSubmitted: true,
     fhirDiagnosticReportId: reportResult.id,  // 新欄位
   });
   ```

3. **`Assessment` interface 加欄位**（**不升 schema version** — Major M6 修正，新欄位無 index 需求）：
   ```ts
   fhirDiagnosticReportId?: string;
   physicianNote?: string;             // m1 修正：暫存醫師當前 session 的草稿；正式提交走 FHIR Observation
   physicianNoteUpdatedAt?: Date;
   ```

## 前置條件 2：圖卡檔名 ASCII 化（**Bug M5 修正**）

**根因確認**：`public/cards/{domain}/01-circle-亮.webp` — 檔名含 CJK 字元 `亮 / 透`。瀏覽器發出 `01-circle-%E4%BA%AE.webp`，GitHub Pages CDN 對 CJK encoding 不穩定（不同節點 / 大小寫處理不一致）導致 404。

**修法（定論）**：
1. 改 `scripts/generate-placeholder-cards.mjs` 變體標籤：`亮` → `light`、`透` → `transparent`
2. 重跑 `pnpm generate:cards` 產生新 60 張 webp
3. `src/data/cards/index.json` filename 同步更新（腳本會重寫）
4. description 欄位仍可保留中文（不在 URL 內）

---

## 頁面 1A：家長簡視 — `/result/?id={uuid}`

### 路由（**Blocker B2/B3 修正**）

- **新增** `src/pages/result/index.astro`（單一檔，不用 `[id].astro`；Astro SSG 不支援 unknown UUID 動態路由）
- Client 從 `URLSearchParams.get('id')` 取 assessment id
- 進入方式：
  - 從評估流程結束時 → `window.location.href = '/result/?id=${id}'`（取代目前 AssessmentShell 內直接 render）
  - 從歷史頁「看詳細」→ `/result/?id={id}`（未登入醫師）

### 資料來源

- 純 IndexedDB：`db.assessments.get(id)` + `db.assessmentEvents.where('assessmentId').equals(id).toArray()`
- 家長端只看自己裝置產的評估，無跨裝置情境

### 資訊架構

1. **Hero 分流結果區**
   - 大字分流類別 + 對應顏色 + emoji
   - 一句解讀（例：「7 個面向需要關注，建議和兒科醫師談談」）
   - 信心度小字
2. **雷達圖**（修資料綁定 + 公式明確 — Minor m7 修正）
   - 8 個 domain，分數 0-100 正規化
   - 換算公式：`score = clamp(50 + 10 * (-z), 0, 100)`（z 為負代表偏離，分數越低；clamp 介於 0-100）
   - 異常 domain（z ≤ -1.5）用紅點與粗線標示
3. **為您挑選的衛教** — 沿用 EducationMatch，視覺升級
4. **行動按鈕區**
   - 主：下載 PDF 報告
   - 副：查看評估歷史 / 開始新評估

### 必要 / 不必要

| 必要 | 不必要 |
|------|--------|
| 分流類別 + 解讀 | raw metric 表 |
| 雷達圖 | z-score 數字 |
| 衛教推薦 | 細節 metric 排版 |
| PDF 下載 | 重複 disclaimer |

---

## 頁面 1B：醫師詳視 — `/workspace/result/?id={uuid}`

### 路由（**Blocker B3 修正**）

- **新增** `src/pages/workspace/result/index.astro`（**不用** `[id].astro`，SSG 無法 enumerate UUID）
- Client 從 `?id={uuid}` 解析

### Auth gate（**Major M1 修正**）

不能用「先 render 後 redirect」模式（會閃畫面、洩 metric）。改用：

```svelte
<script>
  let loading = $state(true);
  let unauthorized = $state(false);

  $effect(() => {
    if (!authStore.isAuthenticated) {
      unauthorized = true;
      window.location.replace(`/result/?id=${id}`);
      return;
    }
    // 已登入才開始抓資料
    loadAssessment(id);
  });
</script>

{#if loading}
  <p>載入中…</p>
{:else if unauthorized}
  <p>需要 FHIR 登入</p>
{:else}
  <!-- 完整 medical UI -->
{/if}
```

關鍵：在 auth 判定完成前**完全不 render** medical UI（包含 metric 表 DOM）。

### 雙來源 resolver（**Blocker B1 + Major M2/M3/M4 修正**）

新增 `src/lib/db/assessment-resolver.ts`：

```ts
type Source = 'idb' | 'fhir';
type ResolveError = 'not_found' | 'token_expired' | 'forbidden' | 'network';

export async function resolveAssessment(id: string): Promise<
  { ok: true; assessment: Assessment; source: Source } |
  { ok: false; error: ResolveError }
> {
  // 1. 本地 IDB（同裝置情境）
  const local = await db.assessments.get(id);
  if (local) return { ok: true, assessment: local, source: 'idb' };

  // 2. FHIR fallback（醫師跨裝置情境）
  if (!authStore.isAuthenticated) return { ok: false, error: 'not_found' };
  try {
    const a = await fetchAssessmentFromFhir(id, authStore.fhirClient);
    return a ? { ok: true, assessment: a, source: 'fhir' } : { ok: false, error: 'not_found' };
  } catch (e) {
    if (e.status === 401) return { ok: false, error: 'token_expired' };
    if (e.status === 403) return { ok: false, error: 'forbidden' };
    return { ok: false, error: 'network' };
  }
}
```

### `src/lib/fhir/assessment-fetch.ts`（新）

```ts
// 反查 DiagnosticReport by identifier（Blocker B1 修正）
export async function fetchAssessmentFromFhir(id: string, client): Promise<Assessment | null> {
  const ASSESSMENT_SYSTEM = 'https://smart-pedi-cds.yao.care/assessment';
  const reports = await client.request(
    `DiagnosticReport?identifier=${ASSESSMENT_SYSTEM}|${id}&_include=DiagnosticReport:result`
  );
  // _include 一次帶回 Observations（Minor m2 修正：避免 N+1 requests）
  // ...parse Bundle → Assessment-shape
}

// 反序列化 Observation 為 metric row（Major M3 修正）
// 從 Observation.code.text "CDSA gross_motor::reactionLatency" 解析回 domain + metric
function parseObservationCode(text: string): { domain: string; metric: string } | null {
  const m = text.match(/^CDSA\s+(\w+)::(\w+)$/);
  return m ? { domain: m[1], metric: m[2] } : null;
}

// 列表 query（Major M4 修正：用實際 LOINC code 而非亂編 category）
// CDSA 評估的 DiagnosticReport 帶 LOINC 71446-2「Mental status assessment」
export async function listAssessmentsFromFhir(patientId: string, client): Promise<AssessmentSummary[]> {
  const reports = await client.request(
    `DiagnosticReport?subject=Patient/${patientId}&code=http://loinc.org|71446-2&_sort=-issued`
  );
  return reports.entry.map(e => ({
    id: extractIdentifierValue(e.resource, ASSESSMENT_SYSTEM),
    fhirReportId: e.resource.id,
    date: new Date(e.resource.effectiveDateTime),
    conclusion: e.resource.conclusion,
    category: parseConclusionToCategory(e.resource.conclusion),
  }));
}
```

### 401 處理

`client.request()` 401 時 fhirclient.js 會自動觸發 token refresh；refresh 失敗才會 throw。spec 信任 fhirclient 流程，不另寫 refresh 邏輯。但 resolver 仍要 catch 並 surface 給 UI 顯示「Session 過期，請重新登入」+ relaunch button → `/launch/`。

### 資訊架構

1. **頂部摘要 bar**：兒童 ID（abbreviate） + 評估日期 + 月齡 + 分流類別
2. **資料來源 badge**：「本地紀錄」or「來自 FHIR Server」
3. **完整 metric 表**：domain 分組，每行 `metric / value / z-score / 異常 flag`，z-score 色帶
4. **時序事件 timeline**：assessment events
   - IDB 來源：顯示完整 timeline
   - FHIR 來源：顯示「此資料來自 FHIR Server，無原始事件紀錄」（FHIR submit 不送 event-level）
5. **醫師備註欄**（m1 修正）：
   - 草稿暫存 `Assessment.physicianNote`（本地 IDB）
   - 「儲存到 FHIR」按鈕 → POST 一個 Observation:
     ```
     code: SNOMED 423876004 "Clinical note"
     valueString: <note>
     subject: Patient/{childFhirId}
     derivedFrom: DiagnosticReport/{fhirReportId}
     ```
   - 提交後本地草稿清空，避免歧義來源
6. **FHIR 提交** / **下載 PDF**：保留現有按鈕

---

## 頁面 2：衛教列表 — `/education/`

### 路由與 hydration（**Minor m4 修正**）

- `src/pages/education/index.astro` SSG prerender 完整列表
- Filter UI 用 `<EducationFilter client:load />` Svelte island（`client:load`，避免進站時無法即時過濾）
- URL query string `?cat=diet&format=video` 由 client 端讀取 + 持久化

### 資訊架構

```
[Header]
[Filter Bar：
  分類 chip filter（單選；含「全部」）：全部 飲食 睡眠 呼吸 運動 里程碑 一般
  格式 toggle：全部 / 📄 文章 / 🎬 影片]
[Card grid auto-fill minmax(280px, 1fr)]
  └ 卡片：
    左上：format icon (📄/🎬，大)
    上：category badge + age group badges
    中：title
    下：summary (2 行截斷)
    右下：「閱讀 →」
[Empty state（filter 無結果）]
```

### 必要 / 不必要

| 必要 | 不必要 |
|------|--------|
| 分類 + 格式 filter | 全文搜尋（下次做） |
| Format icon 區分 | 預覽 modal |
| 年齡層 badges | 排序 |
| Empty state | 收藏 |

---

## 頁面 3：圖卡審核 — `/admin/card-review/`

### Bug 修正（**M5 已收斂為定論**）

走「前置條件 2」的 ASCII 化方案，不再列除錯步驟。

### UI 改造

```
[Header + 說明]
[統計列：總 N / 待審 X / 通過 Y / 退回 Z]
  └ 數字從 src/data/cards/index.json 動態算（Minor m5 修正）
[Status filter tabs：全部 | 待審 | 通過 | 退回]
[Domain filter chips：8 個 domain（單選）]
[Card grid（240px min）]
  └ 卡片：縮圖 / status badge / 中文 title（從 description）/ id（小字）/ attribution
[Empty state（filter 無結果）]
```

### 必要 / 不必要

| 必要 | 不必要 |
|------|--------|
| 修縮圖載入 | in-app approve/reject |
| Status + domain filter | 縮圖 lightbox |
| 中文 title | 多語切換 |
| 動態統計 | sort by date |

---

## 頁面 4：評估歷史 — `/history/`

### 資料來源（**雙軌**）

| 情境 | 列表來源 | 詳細展開 |
|------|---------|---------|
| 未登入 FHIR | `db.assessments.where('childId').equals(id).reverse().sortBy('startedAt')` | IDB 直接展開 |
| 已登入 FHIR | `listAssessmentsFromFhir(patientId)` | 點開時呼叫 `resolveAssessment(id)` |

來源顯示在頁面頂端 badge：「本地紀錄」/「醫院 FHIR」。

### Empty State（無紀錄時）

```
🌱
還沒有評估紀錄
完成第一次評估後，紀錄會在這裡保留。
[ 開始評估 ]（CTA 按鈕）
```

### 有紀錄時

```
[Header + 來源 badge]
[統計卡列：總 X / 最近一次 / 最近分流類別]
[Timeline / List]
  □ 2026/05/14 23:21
    24 個月 · [建議轉介]
    └ [📄 PDF] [👁 看詳細] [⚖️ 加入比較]
  □ ...
[比較區（選 2 筆出現）]
  └ 並排雷達圖 + z-score 差表
```

### 互動

- 比較模式：勾選 ≥ 2 筆 → sticky bar → 「比較」按鈕 → batch fetch full metric（FHIR `_include`）+ 並排雷達圖
- 比較雷達圖：同一 SVG 多個多邊形 + legend 標日期

### 必要 / 不必要

| 必要 | 不必要 |
|------|--------|
| Empty state | 趨勢線圖 |
| 重下 PDF | CSV export |
| 分流 badge | 細項展開 |
| 比較功能 | 多兒童切換 |
| 看詳細 | 統計 export |

---

## 跨頁面一致性

### 設計 token

所有新元件遵守 `src/styles/tokens.css`：
- 顏色：`--color-risk-{normal,advisory,warning,critical}`
- Card style：`border: 1px solid var(--border-default); border-radius: var(--radius-lg); background: var(--bg-surface)`
- Spacing：`--space-*`

### Empty state pattern

統一：icon + 主訊息 + CTA。

### Mobile responsive

所有 grid `repeat(auto-fill, minmax(280px, 1fr))`。Filter chips 橫向可捲動。

---

## 不在本 spec 範圍（明確排除）

- Pagefind 全文搜尋
- 雷達圖 lib 升級
- 醫師工作台首頁改造
- i18n
- 圖卡審核 in-app approve workflow

---

## 驗證（**Minor m3 修正**）

### 自動驗證

- `pnpm check && pnpm lint && pnpm test`
- `pnpm build && pnpm preview` 開瀏覽器
- DevTools mobile viewport 確認響應式
- Console 無新 error

### Playwright E2E 重跑

更新 `tests/e2e/`（若無則新建）並重跑這些 case：
1. 走完整評估流程 → 自動導向 `/result/?id=...`
2. 開 /education/ → 套用 filter → 確認過濾正確
3. 開 /admin/card-review/ → 確認 60 張縮圖**都載入**
4. 開 /history/（無紀錄）→ 確認 empty state
5. 開 /history/（有紀錄）→ 看詳細 / 加入比較

每 case 截圖比對前後差異。

### Lighthouse

跑 Lighthouse on `/` 與 `/result/?id=...`，PWA + Performance + a11y 分數 ≥ 80。

---

## 受影響檔案概覽

| 主題 | 主要檔案 |
|------|---------|
| FHIR identifier round-trip | `src/lib/fhir/cdsa-resources.ts` 改 + `src/lib/fhir/cdsa-submit.ts` 改 |
| 雙來源 resolver | `src/lib/fhir/assessment-fetch.ts`（新）+ `src/lib/db/assessment-resolver.ts`（新） |
| Schema | `src/lib/db/schema.ts` 加 3 個欄位（**不升 version**：`fhirDiagnosticReportId`、`physicianNote`、`physicianNoteUpdatedAt`） |
| 圖卡 ASCII 化 | `scripts/generate-placeholder-cards.mjs` 改 + `pnpm generate:cards` 重產 + `src/data/cards/index.json` |
| 1A 家長簡視 | `src/pages/result/index.astro`（新）+ `src/components/assess/ResultView.svelte` 大改 + `RadarChart.svelte` 修綁定 |
| 1B 醫師詳視 | `src/pages/workspace/result/index.astro`（新）+ `src/components/patient/ResultDetail.svelte`（新） |
| 評估流程結尾改 redirect | `src/components/assess/AssessmentShell.svelte`（complete 時 redirect） |
| 2 衛教 | `src/pages/education/index.astro` + `src/components/education/EducationFilter.svelte`（新） |
| 3 圖卡審核 | `src/pages/admin/card-review.astro` |
| 4 評估歷史 | `src/pages/history.astro` + `src/components/assess/AssessmentHistory.svelte` |

### 測試

- `tests/lib/db/assessment-resolver.test.ts`（新）— mock IDB miss + FHIR success / 401 / 404
- `tests/lib/fhir/assessment-fetch.test.ts`（新）— mock fhirclient + parse Bundle
- `tests/components/EducationFilter.test.ts`（新）— filter 純函式
- `tests/e2e/redesign.spec.ts`（新，Playwright）— 5 個 case 如上
