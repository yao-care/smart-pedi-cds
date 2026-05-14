# 4 頁面重新規劃 — 設計文件（v4）

## 修訂歷史

- v1（commit 82bd571）：原始 4 頁重設計
- v2（commit 821237e）：補 FHIR-vs-IndexedDB 雙來源 resolver
- v3（commit 0dddb50）：第 1 輪審查後修 3 B + 6 M + 7 m
- v4（本版）：第 2 輪審查後修 3 新 B + 7 新 M + 6 新 m。**核心改動：LOINC code 是 hallucinated，改用自有 system URI；補 Bundle ↔ Assessment 反序列化完整對應表；resolver cache；loading 死鎖修法**

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

## 前置條件 1：FHIR resource shape 大改（**Blocker 修正**）

### 1.1 LOINC code 全部 hallucinated — 改用自有 system URI（NEW-B1）

**現況**：`src/lib/fhir/cdsa-resources.ts:146-157` 的 `mapDomainToLoinc` 把 8 個 domain 映射到 `71441-3 ~ 71446-2` 這串 LOINC code。**HAPI 公開 server 與 LOINC 官方查詢都顯示這些 code 不存在**（hallucinated）；CDSA 是 in-house 指標，本就不該強行對應 LOINC。同時 `social_emotional` 與 `DiagnosticReport.code` 都用 `71446-2` 造成撞號（NEW-B2）。

**修法**：

定義專案自有 system URI，**徹底取代 LOINC mapping**：

```ts
// src/lib/fhir/cdsa-resources.ts
const CODE_SYSTEM = 'https://smart-pedi-cds.yao.care/code';
const ID_SYSTEM = 'https://smart-pedi-cds.yao.care/assessment';

// DiagnosticReport.code 用單一獨立 code
const REPORT_CODE = { system: CODE_SYSTEM, code: 'cdsa-assessment', display: 'CDSA 兒童發展智慧評估' };

// Observation.code 用 domain::metric 細粒度 code，與 report code 完全分離
function observationCode(domain: string, metric: string) {
  return {
    system: CODE_SYSTEM,
    code: `cdsa-${domain}-${metric}`,           // 例：cdsa-gross_motor-reactionLatency
    display: `CDSA ${domain}::${metric}`,
  };
}
```

刪除 `mapDomainToLoinc` 函式與所有 LOINC 引用。日後若要對應到 LOINC，再加 `coding[]` 第二個 element，但 reverse mapping 一律以自有 code 為主。

### 1.2 Observation.code.text 格式統一為 `domain::metric`（M3 修正）

舊版（已提交 FHIR）的 Observation 用 `CDSA ${domain}: ${metric}`（單冒號+空白）。v4 改 `domain::metric`（已含在上面 `display`）。

**Migration 策略**：parser 同時接受兩種：
```ts
function parseObservationCode(text: string): { domain: string; metric: string } | null {
  // 接受新格式 "CDSA gross_motor::reactionLatency" 或舊格式 "CDSA gross_motor: reactionLatency"
  const m = text.match(/^CDSA\s+(\w+)(?:::|:\s+)(\w+)$/);
  return m ? { domain: m[1], metric: m[2] } : null;
}
```

### 1.3 把 confidence、status、startedAt 寫進 FHIR（NEW-B3）

`Assessment` 反序列化需要欄位來源對應：

| Assessment 欄位 | FHIR 欄位 | 寫入時機 | 反序列化 |
|---|---|---|---|
| `id` | `DiagnosticReport.identifier[?system=ID_SYSTEM].value` | submit 時 | 直接讀 |
| `fhirDiagnosticReportId` | `DiagnosticReport.id`（server 配發） | submit response | N/A |
| `triageResult.category` | `DiagnosticReport.conclusionCode[0].coding[0].code`（SNOMED 17621005 / 394848005 / 3457005） | 已有 | reverse map（不再 parse 中文 conclusion — NEW-m5） |
| `triageResult.confidence` | `DiagnosticReport.extension[?url=CONFIDENCE_EXT_URL].valueDecimal` | 新增 | 直接讀（不再 regex 中文） |
| `triageResult.summary` | `DiagnosticReport.conclusion` 去除「（信心度 X%）」前綴後的剩餘文字 | 已有 | strip prefix |
| `status` | `DiagnosticReport.status`：`final = completed`，`preliminary = in_progress` | 已有（fixed `final`） | reverse map |
| `startedAt` | `DiagnosticReport.effectivePeriod.start` | 新增（取代 `effectiveDateTime`） | 直接讀 |
| `completedAt` | `DiagnosticReport.effectivePeriod.end` | 新增 | 直接讀 |
| `childId` | `DiagnosticReport.subject.reference` 去除 `Patient/` 前綴 | 已有 | 直接讀 |

新增的 extension URL：
```ts
const CONFIDENCE_EXT_URL = 'https://smart-pedi-cds.yao.care/extension/triage-confidence';
```

DiagnosticReport.effective 從 `effectiveDateTime` 改為 `effectivePeriod`，相容性：FHIR R4 允許二者擇一，現有資料用 `effectiveDateTime` 的退路是反序列化時兩者都試。

### 1.4 identifier round-trip（B1 沿用 v3 設計，僅命名統一）

```ts
buildAssessmentObservations(...) {
  return details.map((d, i) => ({
    resourceType: 'Observation',
    identifier: [{ system: ID_SYSTEM, value: `${assessment.id}::${d.domain}::${d.metric}` }],
    code: {
      coding: [observationCode(d.domain, d.metric)],
      text: observationCode(d.domain, d.metric).display,  // "CDSA domain::metric"
    },
    // ...
  }));
}

buildTriageDiagnosticReport(...) {
  return {
    resourceType: 'DiagnosticReport',
    identifier: [{ system: ID_SYSTEM, value: assessment.id }],
    code: { coding: [REPORT_CODE] },
    status: 'final',
    effectivePeriod: {
      start: assessment.startedAt.toISOString(),
      end: assessment.completedAt?.toISOString(),
    },
    extension: [{
      url: CONFIDENCE_EXT_URL,
      valueDecimal: triageResult.confidence,
    }],
    conclusion: triageResult.summary,                 // 去掉中文信心度前綴
    conclusionCode: [/* 既有 SNOMED mapping */],
    // ...
  };
}
```

`submitAssessmentToFhir` 成功後：
```ts
await db.assessments.update(assessment.id, {
  fhirSubmitted: true,
  fhirDiagnosticReportId: reportResult.id,
});
```

### 1.5 `Assessment` interface 加欄位（**不升 schema version** — M6）

```ts
fhirDiagnosticReportId?: string;
physicianNote?: string;
physicianNoteUpdatedAt?: Date;
```

**Migration**（NEW-M6）：既有資料這 3 欄為 `undefined`，所有 UI 必須容忍 `value ?? ''` / `?.` 訪問；本次不寫遷移腳本（無數據需要轉換）。

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
  - 從評估流程結束時 → ``window.location.href = `/result/?id=${id}` ``（反引號模板字串，**NEW-m1 修正**）；取代目前 AssessmentShell 內直接 render `<ResultView>`
  - 從歷史頁「看詳細」→ `/result/?id={id}`（未登入醫師）
  - **AssessmentShell 改動**：`currentStep === 'result'` 不再 render `<ResultView />`；改在 step transition 到 result 時 redirect。原 `<ResultView />` 仍保留供 `/result/?id=...` 載入

### 資料來源

- 純 IndexedDB：`db.assessments.get(id)` + `db.assessmentEvents.where('assessmentId').equals(id).toArray()`
- 家長端只看自己裝置產的評估，無跨裝置情境

### 資訊架構

1. **Hero 分流結果區**
   - 大字分流類別 + 對應顏色 + emoji
   - 一句解讀（例：「7 個面向需要關注，建議和兒科醫師談談」）
   - 信心度小字
2. **雷達圖**（修資料綁定 + 公式明確 — m7 + NEW-m6 修正）
   - 8 個 domain，分數 0-100 正規化
   - 換算公式：`score = clamp(50 + 10 * (-z), 0, 100)`
     - **語義**：z 是「相對常模的標準差距」。z 為**負**代表低於常模（發展落後）→ `(-z)` 為正 → score 高於 50 是反向；**這裡 score 表示「正常程度」，越高越好**
     - 簡明：z = 0 → score 50（一般）；z = -1.5（明顯偏離）→ score 35；z = +1.5（高於常模）→ score 65
   - 等等，反了 — 應改公式為 `score = clamp(50 + 10 * z, 0, 100)`：z=0 → 50；z=+1.5（領先）→ 65；z=-1.5（落後）→ 35。雷達圖「越大越好」一致。
   - **採用**：`score = clamp(50 + 10 * z, 0, 100)`
   - 異常 domain（z ≤ -1.5）用紅點 + 粗線標示
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

### Auth gate（**M1 + NEW-M1 死鎖修正**）

不能用「先 render 後 redirect」模式（會閃畫面、洩 metric）。改用：

```svelte
<script>
  let loading = $state(true);
  let error = $state<ResolveError | null>(null);
  let assessment = $state<Assessment | null>(null);

  $effect(() => {
    const id = new URLSearchParams(location.search).get('id');
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {  // NEW-M4: UUID 格式檢查
      error = 'not_found';
      loading = false;
      return;
    }
    if (!authStore.isAuthenticated) {
      window.location.replace(`/result/?id=${encodeURIComponent(id)}`);
      // loading 維持 true 直到 redirect 完成；不顯示任何 medical UI
      return;
    }
    (async () => {
      try {
        const result = await resolveAssessment(id);
        if (result.ok) {
          assessment = result.assessment;
        } else {
          error = result.error;
        }
      } finally {
        loading = false;
      }
    })();
  });
</script>

{#if loading}
  <p>載入中…</p>
{:else if error === 'token_expired'}
  <p>Session 過期，<a href="/launch/">重新登入</a></p>
{:else if error === 'forbidden'}
  <p>沒有檢視此評估的權限</p>
{:else if error === 'not_found'}
  <p>找不到此評估</p>
{:else if error === 'network'}
  <p>連線失敗，請稍後再試</p>
{:else if assessment}
  <!-- 完整 medical UI -->
{/if}
```

關鍵：所有 error / unauthorized branch 都會把 `loading` 設成 `false`（除了 redirect 中 — 那本來就不需 render），不會死鎖。

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
    if (!a) return { ok: false, error: 'not_found' };

    // NEW-M3: cache 進 IDB，避免重複開同一筆每次都打 FHIR
    // 標記 source 讓 UI 可顯示「資料來自 FHIR」(透過 cache miss 的第一筆查詢識別)
    await db.assessments.put(a);

    return { ok: true, assessment: a, source: 'fhir' };
  } catch (e: any) {
    // NEW-m3: fhirclient v2 不會自動 refresh on 401，呼叫端必須處理
    if (e?.status === 401 || e?.response?.status === 401) {
      // 嘗試 refresh 一次
      try {
        await authStore.fhirClient.refresh();
        const retry = await fetchAssessmentFromFhir(id, authStore.fhirClient);
        if (retry) {
          await db.assessments.put(retry);
          return { ok: true, assessment: retry, source: 'fhir' };
        }
        return { ok: false, error: 'not_found' };
      } catch {
        return { ok: false, error: 'token_expired' };
      }
    }
    if (e?.status === 403) return { ok: false, error: 'forbidden' };
    if (e?.status === 404) return { ok: false, error: 'not_found' };
    return { ok: false, error: 'network' };
  }
}
```

### `src/lib/fhir/assessment-fetch.ts`（新）

```ts
const CODE_SYSTEM = 'https://smart-pedi-cds.yao.care/code';
const ID_SYSTEM = 'https://smart-pedi-cds.yao.care/assessment';
const CONFIDENCE_EXT_URL = 'https://smart-pedi-cds.yao.care/extension/triage-confidence';

// 反查 DiagnosticReport by identifier（B1 修正，code 改用自有 system — NEW-B1）
export async function fetchAssessmentFromFhir(id: string, client): Promise<Assessment | null> {
  const bundle = await client.request(
    `DiagnosticReport?identifier=${ID_SYSTEM}|${id}` +
    `&_include=DiagnosticReport:result`  // m2: 一次帶回 Observations
  );
  const reportEntry = bundle.entry?.find(e => e.resource.resourceType === 'DiagnosticReport');
  if (!reportEntry) return null;
  const obsEntries = bundle.entry?.filter(e => e.resource.resourceType === 'Observation') ?? [];
  return bundleToAssessment(reportEntry.resource, obsEntries.map(e => e.resource));
}

// 列表 query（NEW-B2 修正：用自有 cdsa-assessment code，不撞 Observation）
export async function listAssessmentsFromFhir(patientId: string, client): Promise<AssessmentSummary[]> {
  const bundle = await client.request(
    `DiagnosticReport?subject=Patient/${patientId}` +
    `&code=${CODE_SYSTEM}|cdsa-assessment` +
    `&_sort=-date`
  );
  return (bundle.entry ?? []).map(e => {
    const r = e.resource;
    return {
      id: r.identifier?.find(i => i.system === ID_SYSTEM)?.value ?? r.id,
      fhirReportId: r.id,
      date: new Date(r.effectivePeriod?.start ?? r.effectiveDateTime),
      // NEW-m5: 用 conclusionCode 反查，不再 parse 中文 conclusion
      category: snomedToCategory(r.conclusionCode?.[0]?.coding?.[0]?.code),
      summary: r.conclusion,
    };
  });
}

// NEW-B3: 完整 Bundle → Assessment 反序列化
function bundleToAssessment(report: any, observations: any[]): Assessment {
  const idVal = report.identifier?.find(i => i.system === ID_SYSTEM)?.value;
  const confidence = report.extension?.find(x => x.url === CONFIDENCE_EXT_URL)?.valueDecimal ?? 0;
  const startedAt = new Date(report.effectivePeriod?.start ?? report.effectiveDateTime);
  const completedAt = report.effectivePeriod?.end ? new Date(report.effectivePeriod.end) : undefined;

  return {
    id: idVal,
    childId: report.subject.reference.replace(/^Patient\//, ''),
    status: report.status === 'final' ? 'completed' : 'in_progress',
    language: 'zh-TW',
    currentStep: 7,
    startedAt,
    completedAt,
    triageResult: {
      category: snomedToCategory(report.conclusionCode?.[0]?.coding?.[0]?.code),
      confidence,
      summary: report.conclusion ?? '',
    },
    fhirSubmitted: true,
    fhirDiagnosticReportId: report.id,
    createdAt: startedAt,
    updatedAt: completedAt ?? startedAt,
  };
}

function snomedToCategory(code: string | undefined): 'normal' | 'monitor' | 'refer' {
  switch (code) {
    case '17621005': return 'normal';   // Normal
    case '394848005': return 'monitor'; // Follow-up
    case '3457005': return 'refer';     // Refer
    default: return 'monitor';
  }
}

// Observation.code.text 解析（M3 + migration 相容）
function parseObservationCode(text: string): { domain: string; metric: string } | null {
  const m = text.match(/^CDSA\s+(\w+)(?:::|:\s+)(\w+)$/);
  return m ? { domain: m[1], metric: m[2] } : null;
}
```

### 401 處理（**NEW-m3 修正**）

實測 fhirclient v2 **不會**在 `client.request()` 401 時自動 refresh，必須呼叫端 catch + `client.refresh()` + retry 一次。Resolver 已實作（見上）。Retry 仍失敗才 surface `token_expired` 給 UI 顯示「Session 過期，請重新登入」+ relaunch link → `/launch/`。

### 資訊架構

1. **頂部摘要 bar**：兒童 ID（abbreviate） + 評估日期 + 月齡 + 分流類別
2. **資料來源 badge**：「本地紀錄」or「來自 FHIR Server」
3. **完整 metric 表**：domain 分組，每行 `metric / value / z-score / 異常 flag`，z-score 色帶
4. **時序事件 timeline**：assessment events
   - IDB 來源：顯示完整 timeline
   - FHIR 來源：顯示「此資料來自 FHIR Server，無原始事件紀錄」（FHIR submit 不送 event-level）
5. **醫師備註欄**（m1 + NEW-M5 + NEW-M7 修正）：
   - 草稿暫存 `Assessment.physicianNote`（本地 IDB；keystroke debounce 500ms 寫入）
   - 「儲存到 FHIR」按鈕 → POST 一個 Observation:
     ```ts
     {
       resourceType: 'Observation',
       status: 'final',
       category: [{ coding: [{
         system: 'http://terminology.hl7.org/CodeSystem/observation-category',
         code: 'survey',  // 不用 SNOMED 423876004（NEW-M5 — 該 code 為 "Physical examination"，誤用）
       }]}],
       code: { coding: [{ system: CODE_SYSTEM, code: 'cdsa-physician-note', display: '醫師備註' }] },
       subject: { reference: `Patient/${childFhirId}` },
       derivedFrom: [{ reference: `DiagnosticReport/${fhirReportId}` }],
       effectiveDateTime: new Date().toISOString(),
       valueString: note,
     }
     ```
   - **NEW-M7：只在 POST 成功後清空本地草稿**：
     ```ts
     try {
       await client.create('Observation', payload);
       await db.assessments.update(id, { physicianNote: undefined, physicianNoteUpdatedAt: undefined });
       toast.success('已儲存至 FHIR');
     } catch (e) {
       toast.error('儲存失敗，草稿保留');  // 草稿保留供下次重試
     }
     ```
6. **FHIR 提交** / **下載 PDF**：保留現有按鈕

---

## 頁面 2：衛教列表 — `/education/`

### 路由與 hydration（**m4 + NEW-M2 修正**）

- `src/pages/education/index.astro` 整頁交給單一 Svelte 元件 `<EducationListPage client:only="svelte" />`
- **為何用 `client:only` 而非 `client:load`**：深連結 `/education/?cat=diet` 時 SSG 預先 render 全列表會閃（FOUC）；改用 `client:only` 完全交給 client render，配合骨架屏（skeleton）首屏。
- 衛教資料：build 階段把 `getCollection('education')` 結果序列化為 `public/education-index.json`（透過 Astro integration 或在 `getStaticPaths` 階段寫入），client 端 `fetch` 載入後 render + filter
- URL query `?cat=diet&format=video` 由 client 端讀寫

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

### 資料來源（**雙軌 + NEW-m2 明確 child id 取得**）

| 情境 | 列表來源 | 詳細展開 |
|------|---------|---------|
| 未登入 FHIR | `db.assessments.where('childId').equals(childId).reverse().sortBy('startedAt')` | IDB 直接展開 |
| 已登入 FHIR | `listAssessmentsFromFhir(patientFhirId)` | 點開時呼叫 `resolveAssessment(id)` |

**childId 來源**（消除 NEW-m2 歧義）：
- 未登入：從 `assessmentStore.child?.id`（家長端 store 唯一活躍 child）或 URL query `?child={uuid}`
- 已登入：從 FHIR context — `authStore.fhirClient.patient.id`

來源顯示在頁面頂端 badge：「本地紀錄」/「醫院 FHIR Server」。

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

### Lighthouse（**NEW-m4 修正**）

跑 Lighthouse on `/` 與 `/result/?id=...`，目標：
- a11y ≥ 90
- Performance ≥ 80
- PWA ≥ 80

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
