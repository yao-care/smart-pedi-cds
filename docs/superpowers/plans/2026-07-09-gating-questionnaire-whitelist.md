# 分流 gating 白名單化 + drawing/behavior display-only 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓 per-domain 分流只由 ASQ-3 問卷常模驅動——drawing/behavior 等感測啟發式改 display-only（顯示保留、不進 gating），並重算歷史評估。

**Architecture:** 把 `triage.ts` 與 `recompute-triage.ts` 的 per-domain gating loop 由「黑名單排除 pose/voice」改為「白名單只收 `questionnaireScore`」；bump IDB v9 觸發歷史重算（複用既有 `applyTriageRecomputeUpgrade`）。

**Tech Stack:** TypeScript strict、Vitest、Dexie 4（IndexedDB）、fake-indexeddb。

## Global Constraints

- TypeScript strict，不允許 `any`。
- 測試先行（TDD）：先寫失敗測試、跑到 FAIL、再最小實作、跑到 PASS、commit。
- Dexie schema：改索引欄位要 bump 版本並寫 upgrade tx；本計畫無索引變更，bump v9 純為觸發 in-memory 重算。
- 繁體中文註解與文案（zh-TW）。
- commit message 結尾：`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。
- 設計來源：`docs/superpowers/specs/2026-07-09-gating-questionnaire-whitelist-design.md`。

## File Structure

- `src/engine/cdsa/triage.ts` — live 分流；gating loop 白名單化（Task 1）。
- `src/lib/baselines/recompute-triage.ts` — 歷史重算純函數；gating loop 白名單化（Task 2）。
- `src/lib/db/schema.ts` — bump v9 + `applyTriageRecomputeUpgrade` version 型別加 `'v9'`（Task 3）。
- `tests/engine/triage.test.ts` — live gating 測試（Task 1）。
- `tests/lib/recompute-triage.test.ts` — 重算 gating 測試（Task 2）。
- `tests/lib/db/v9-upgrade.test.ts` — v9 upgrade 整合測試，新檔（Task 3）。

---

### Task 1: triage.ts gating 白名單化

**Files:**
- Modify: `src/engine/cdsa/triage.ts:290-302`（per-domain gating loop）
- Test: `tests/engine/triage.test.ts`

**Interfaces:**
- Consumes: 既有 `computeTriage(input: TriageInput)`、測試 helper `makeBehavior` / `makeDrawing` / `baseInput`（`tests/engine/triage.test.ts` 檔頭已定義）。
- Produces: 無新對外介面；行為變更——`domainCategories`/`domainLevelZ` 只含問卷 domain。

- [ ] **Step 1: 寫失敗測試**（加在 `tests/engine/triage.test.ts` 現有 voice display-only 測試群之後）

```ts
describe('computeTriage — gating whitelist (drawing/behavior display-only)', () => {
  it('drawing "normal" does NOT dilute a questionnaire fine_motor refer signal', async () => {
    const withDrawing = await computeTriage({
      ...baseInput,
      drawing: makeDrawing({ overallScore: 60 }), // z≈+0.25（正常）
      questionnaireScores: { fine_motor: 2 },
      questionnaireMaxScores: { fine_motor: 20 },
    });
    const withoutDrawing = await computeTriage({
      ...baseInput,
      drawing: makeDrawing({ shapes: [] }), // 無 drawing detail
      questionnaireScores: { fine_motor: 2 },
      questionnaireMaxScores: { fine_motor: 20 },
    });
    expect(withoutDrawing.domainCategories?.fine_motor).toBe('refer');
    expect(withDrawing.domainCategories?.fine_motor).toBe('refer');
    expect(withDrawing.domainLevelZ?.fine_motor).toBeCloseTo(
      withoutDrawing.domainLevelZ!.fine_motor, 10,
    );
  });

  it('behavior game metrics do NOT produce per-domain gating (display-only)', async () => {
    const result = await computeTriage({
      ...baseInput,
      behavior: makeBehavior({
        completionRate: 0.1, operationConsistency: 0.1,
        reactionLatency: 8000, interactionRhythm: 0.05,
      }), // 極差
    });
    expect(result.domainCategories?.behavior).toBeUndefined();
    expect(result.domainLevelZ?.behavior).toBeUndefined();
  });

  it('gating reflects ONLY questionnaire domains (whitelist)', async () => {
    // baseInput 帶 behavior + drawing + voice；只有問卷 cognition 應進 gating。
    const result = await computeTriage({
      ...baseInput,
      questionnaireScores: { cognition: 18 },
      questionnaireMaxScores: { cognition: 20 },
    });
    expect(Object.keys(result.domainCategories ?? {})).toEqual(['cognition']);
  });
});
```

- [ ] **Step 2: 跑測試確認 FAIL**

Run: `pnpm exec vitest run tests/engine/triage.test.ts -t "gating whitelist"`
Expected: FAIL（現行 gating 納入 drawing→fine_motor 被稀釋、behavior 產出 gating、cognition 以外還有 behavior/fine_motor）。

- [ ] **Step 3: 白名單化 gating loop**

把 `src/engine/cdsa/triage.ts:290-302` 的迴圈改為：

```ts
  const domainZs: Record<string, number[]> = {};
  for (const d of details) {
    // 白名單：per-domain gating 只由 ASQ-3 問卷常模驅動。所有感測啟發式
    // （pose/voice/drawing/behavior）對比的是非臨床效度常模（手寫 defaults 或
    // 佔位模型），一律 display-only——仍保留在 details 供雷達顯示與醫師檢視，
    // 但不進 gating，避免稀釋或杜撰問卷的分流判定。
    if (d.metric !== 'questionnaireScore') continue;
    if (d.directionalZ !== null && d.directionalZ !== undefined) {
      if (!domainZs[d.domain]) domainZs[d.domain] = [];
      domainZs[d.domain].push(d.directionalZ);
    }
  }
```

- [ ] **Step 4: 跑測試確認 PASS**

Run: `pnpm exec vitest run tests/engine/triage.test.ts`
Expected: PASS（新 3 測試 + 既有 triage 測試全綠；既有 pose/voice display-only 測試仍綠）。

- [ ] **Step 5: Commit**

```bash
git add src/engine/cdsa/triage.ts tests/engine/triage.test.ts
git commit -m "$(cat <<'EOF'
fix(cdsa): gating 白名單化——drawing/behavior 改 display-only

per-domain gating 由「排除 pose/voice」改為「只收 questionnaireScore」。drawing
的啟發式 z 不再稀釋問卷 fine_motor、behavior 遊戲 metric 不再靠手寫任意常模獨立
產出分流。分流只由 ASQ-3 問卷常模驅動。details 仍保留全部感測供顯示。

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: recompute-triage.ts gating 白名單化

**Files:**
- Modify: `src/lib/baselines/recompute-triage.ts:173-181`（gating loop）
- Test: `tests/lib/recompute-triage.test.ts`

**Interfaces:**
- Consumes: 既有 `recomputeTriageResult(oldResult, ageGroup)`、`baseResult`（`tests/lib/recompute-triage.test.ts` 檔頭已定義）。
- Produces: 行為變更——重算後 `domainCategories`/`domainLevelZ` 只含問卷 domain。

- [ ] **Step 1: 寫失敗測試**（加在 `tests/lib/recompute-triage.test.ts` 的 voice migration describe 之後）

```ts
describe('recomputeTriageResult — gating whitelist (drawing/behavior)', () => {
  it('drawing does not dilute, and behavior does not gate, after recompute', () => {
    const out = recomputeTriageResult({
      ...baseResult,
      details: [
        { domain: 'fine_motor', metric: 'drawingScore', value: 60, zScore: 0.25, directionalZ: 0.25, isAnomaly: false },
        { domain: 'behavior', metric: 'completionRate', value: 0.1, zScore: -4, directionalZ: -4, isAnomaly: true },
        { domain: 'fine_motor', metric: 'questionnaireScore', value: 2, zScore: -3, directionalZ: -3, maxScore: 20, isAnomaly: true },
      ],
    }, '25-36m');
    // fine_motor 只反映問卷（drawing 不稀釋）
    expect(out.domainCategories?.fine_motor).toBe('refer');
    // behavior 不 gate（純顯示）
    expect(out.domainCategories?.behavior).toBeUndefined();
    expect(out.domainLevelZ?.behavior).toBeUndefined();
    // drawing detail 仍保留於 details（顯示用）
    expect(out.details?.some((d) => d.metric === 'drawingScore')).toBe(true);
  });
});
```

- [ ] **Step 2: 跑測試確認 FAIL**

Run: `pnpm exec vitest run tests/lib/recompute-triage.test.ts -t "gating whitelist"`
Expected: FAIL（現行 recompute 納入 drawing→fine_motor 稀釋、behavior 產出 gating）。

- [ ] **Step 3: 白名單化 recompute gating loop**

把 `src/lib/baselines/recompute-triage.ts:173-181` 的迴圈改為：

```ts
  // 2. 合成 domain-level z（與 triage.ts 同邏輯：白名單只收問卷）
  const domainZs: Record<string, number[]> = {};
  for (const d of newDetails) {
    // 白名單：只有 ASQ-3 問卷常模驅動 gating。所有感測啟發式
    // （pose/voice/drawing/behavior）display-only——保留於 details 供顯示，
    // 不進 gating。與 live triage.ts 一致。
    if (d.metric !== 'questionnaireScore') continue;
    if (d.directionalZ !== null && d.directionalZ !== undefined) {
      if (!domainZs[d.domain]) domainZs[d.domain] = [];
      domainZs[d.domain].push(d.directionalZ);
    }
  }
```

- [ ] **Step 4: 跑測試確認 PASS**

Run: `pnpm exec vitest run tests/lib/recompute-triage.test.ts`
Expected: PASS（新測試 + 既有 recompute 測試全綠；既有 voice migration / pose 排除測試仍綠）。

- [ ] **Step 5: Commit**

```bash
git add src/lib/baselines/recompute-triage.ts tests/lib/recompute-triage.test.ts
git commit -m "$(cat <<'EOF'
fix(cdsa): recompute gating 白名單化，與 live triage 對齊

歷史重算的 per-domain gating 同步改為只收 questionnaireScore，drawing/behavior
display-only。此前 recompute 只排除 pose/voice，歷史重算 gating 與新評估不一致。

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: IDB v9 upgrade 重算歷史

**Files:**
- Modify: `src/lib/db/schema.ts`（`applyTriageRecomputeUpgrade` version 型別加 `'v9'`；新增 `this.version(9)`）
- Test: `tests/lib/db/v9-upgrade.test.ts`（新檔）

**Interfaces:**
- Consumes: 既有 `applyTriageRecomputeUpgrade(tx, version)`（現型別 `'v6' | 'v7' | 'v8'`）。
- Produces: v9 upgrade tx；`schemaVersion` 標記 `'v9-recomputed'` 等。

- [ ] **Step 1: 寫失敗測試**（新檔 `tests/lib/db/v9-upgrade.test.ts`）

```ts
/**
 * IndexedDB v5→v9 upgrade tx 整合測試。
 * v9 重算讓歷史評估的 gating 白名單化——drawing 不再污染 fine_motor、
 * behavior 不再產出 gating（與 live triage 一致）。
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import Dexie from 'dexie';
import { applyTriageRecomputeUpgrade } from '../../../src/lib/db/schema';

const TEST_STORES = {
  children: 'id, createdAt',
  assessments: 'id, childId, status, createdAt, [childId+status]',
};

async function openV9TestDb(dbName: string): Promise<Dexie> {
  const db = new Dexie(dbName);
  db.version(5).stores(TEST_STORES);
  db.version(6).stores(TEST_STORES).upgrade(tx => applyTriageRecomputeUpgrade(tx, 'v6'));
  db.version(7).stores(TEST_STORES).upgrade(tx => applyTriageRecomputeUpgrade(tx, 'v7'));
  db.version(8).stores(TEST_STORES).upgrade(tx => applyTriageRecomputeUpgrade(tx, 'v8'));
  db.version(9).stores(TEST_STORES).upgrade(tx => applyTriageRecomputeUpgrade(tx, 'v9'));
  await db.open();
  return db;
}

async function seedV5Db(dbName: string, children: object[], assessments: object[]): Promise<void> {
  const v5 = new Dexie(dbName);
  v5.version(5).stores(TEST_STORES);
  await v5.open();
  if (children.length > 0) await v5.table('children').bulkPut(children);
  if (assessments.length > 0) await v5.table('assessments').bulkPut(assessments);
  v5.close();
}

let c = 0;
const nextDbName = () => `test-v9-upgrade-${Date.now()}-${++c}`;

describe('IndexedDB v5→v9 upgrade tx integration', () => {
  let dbName: string;
  beforeEach(() => { dbName = nextDbName(); });

  it('recompute removes drawing/behavior from gating; fine_motor reflects only questionnaire', async () => {
    await seedV5Db(dbName, [
      { id: 'child-1', birthDate: '2022-03-09', createdAt: new Date('2026-01-01') },
    ], [
      {
        id: 'assess-1',
        childId: 'child-1',
        status: 'completed',
        completedAt: new Date('2026-07-09T06:34:00Z'),
        createdAt: new Date('2026-07-09T06:20:00Z'),
        triageResult: {
          category: 'monitor', confidence: 0.75, summary: '舊文案',
          details: [
            // drawing 正常曾把 fine_motor 從 refer 拉成 monitor
            { domain: 'fine_motor', metric: 'drawingScore', value: 60, zScore: 0.25, directionalZ: 0.25, isAnomaly: false },
            { domain: 'fine_motor', metric: 'questionnaireScore', value: 2, zScore: -3, directionalZ: -3, maxScore: 20, isAnomaly: true },
            // behavior 曾獨立產出 gating
            { domain: 'behavior', metric: 'completionRate', value: 0.1, zScore: -4, directionalZ: -4, isAnomaly: true },
          ],
        },
      },
    ]);

    const db = await openV9TestDb(dbName);
    const a = await db.table('assessments').get('assess-1');

    expect(a.schemaVersion).toBe('v9-recomputed');
    // fine_motor 只反映問卷 → refer（drawing 不稀釋）
    expect(a.triageResult.domainCategories?.fine_motor).toBe('refer');
    // behavior 不在 gating
    expect(a.triageResult.domainCategories?.behavior).toBeUndefined();
    // drawing detail 仍保留供顯示
    expect(a.triageResult.details.some((d: { metric: string }) => d.metric === 'drawingScore')).toBe(true);
    db.close();
  });
});
```

- [ ] **Step 2: 跑測試確認 FAIL**

Run: `pnpm exec vitest run tests/lib/db/v9-upgrade.test.ts`
Expected: FAIL（`applyTriageRecomputeUpgrade(tx, 'v9')` 的 `'v9'` 不符現型別 `'v6' | 'v7' | 'v8'`，型別錯 / 或 schemaVersion 非 `v9-recomputed`）。

- [ ] **Step 3a: 擴充 version 型別**

`src/lib/db/schema.ts` 的 `applyTriageRecomputeUpgrade` 簽名（約 line 13）：

```ts
  version: 'v6' | 'v7' | 'v8' | 'v9',
```

- [ ] **Step 3b: 新增 version(9)**

在 `src/lib/db/schema.ts` 的 `this.version(8)….upgrade(tx => applyTriageRecomputeUpgrade(tx, 'v8'));` 之後、`}` 之前，插入：

```ts
    // v9: gating 白名單化——drawing/behavior 改 display-only。此前 gating 只排除
    // pose/voice，drawing 仍污染 fine_motor、behavior 靠手寫常模獨立產出分流。
    // recompute 已同步白名單（只收 questionnaireScore）；bump v9 重算歷史，使
    // 舊評估分流只由 ASQ-3 問卷驅動，與新評估一致。索引無變更。
    this.version(9).stores({
      patients: 'id, ageGroup, currentRiskLevel, lastSyncedAt',
      observations: 'id, patientId, indicator, effectiveDateTime, [patientId+indicator]',
      alerts: 'id, patientId, riskLevel, status, createdAt, [patientId+status]',
      baselines: '[patientId+indicator], patientId, updatedAt',
      syncQueue: 'id, createdAt',
      serverConfigs: 'id, lastUsedAt',
      educationInteractions: 'id, contentSlug, createdAt',
      ruleVersions: 'id, createdAt',
      webhookHistory: 'id, webhookId, alertId, createdAt',
      children: 'id, createdAt',
      assessments: 'id, childId, status, createdAt, [childId+status]',
      assessmentEvents: 'id, assessmentId, childId, moduleType, timestamp, [assessmentId+moduleType]',
      mediaFiles: 'id, assessmentId, childId, fileType, createdAt, [assessmentId+fileType]',
      normThresholds: 'id, ageGroup, metric, [ageGroup+metric]',
      customEducation: 'id, tenantId, category, isActive, [tenantId+isActive]',
      tenantSettings: 'id, tenantId',
      recommendationOverlays: 'id, tenantId, category, domain, [tenantId+category+domain]',
    }).upgrade(tx => applyTriageRecomputeUpgrade(tx, 'v9'));
```

- [ ] **Step 4: 跑測試確認 PASS**

Run: `pnpm exec vitest run tests/lib/db/v9-upgrade.test.ts tests/lib/db/v8-upgrade.test.ts`
Expected: PASS（v9 新測試綠；v8 既有測試仍綠——chain 相容）。

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/schema.ts tests/lib/db/v9-upgrade.test.ts
git commit -m "$(cat <<'EOF'
feat(db): IDB v9 upgrade 重算歷史——套用 gating 白名單

bump v9 + applyTriageRecomputeUpgrade('v9') 重算所有歷史評估，使 drawing 不再
污染 fine_motor、behavior 不再產出 gating，與 live 分流一致。索引無變更。

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: 全套驗證 + push

**Files:** 無（驗證與部署）

- [ ] **Step 1: 全套單元測試**

Run: `pnpm test`
Expected: 全綠（含新增測試）。

- [ ] **Step 2: 型別檢查**

Run: `pnpm check`
Expected: 0 errors。

- [ ] **Step 3: build + SEO 守門**

Run: `pnpm build`
Expected: build 成功、「SEO 建置後守門全數通過」。

- [ ] **Step 4: push**

```bash
git push origin main
```

- [ ] **Step 5: 部署後 live 冒煙（非阻塞，記錄於回報）**

- 等 `gh run list` 的 Deploy 顯示 success、live 關鍵頁 200。
- 重新載入 https://smart-pedi-cds.yao.care 觸發 v9 IDB upgrade；開 `/history/` 既有評估，確認分流結果只反映問卷（先前被 drawing/behavior 影響的評估其 overall category 可能變動——為刻意矯正）。

---

## Self-Review（對照 spec）

- **§3.1 gating 白名單化** → Task 1 ✓
- **§3.2 per-detail isAnomaly 不變** → 白名單只改 gating loop，未動 isAnomaly 計算；Task 1 測試不觸及 isAnomaly，保持不變 ✓
- **§3.3 recompute 同步** → Task 2 ✓（v7 drawing sanitize 未動，符合 spec「保留不變」）
- **§3.4 IDB v9** → Task 3 ✓
- **§4 測試計畫** → Task 1（drawing 不稀釋/behavior 不 gate/白名單等價）、Task 2（重算）、Task 3（v9 upgrade）全覆蓋 ✓
- **§5 驗證** → Task 4 ✓
- **§7 風險（v9 改變部分歷史 category）** → Task 3 commit message + Task 4 Step 5 live 冒煙註記 ✓
- Placeholder scan：無 TBD/TODO，測試與實作 code 皆完整 ✓
- 型別一致：`questionnaireScore` 字串、`applyTriageRecomputeUpgrade` 簽名、helper 名稱（makeDrawing/makeBehavior/baseResult）跨 task 一致 ✓
