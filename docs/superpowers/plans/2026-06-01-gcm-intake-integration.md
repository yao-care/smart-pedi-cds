# GCM 收案 server 串接 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓家長在評估結果頁可選「GCM」為收案點，以 SMART on FHIR（動態註冊 + PKCE）把評估結果上傳到 `https://gcm.fhir.yao.care`，並順手補通既有醫院 fhirclient standalone callback。

**Architecture:** 新增 `src/lib/fhir/gcm-submit.ts`（原生 fetch + crypto.subtle PKCE，含純函數 `assembleTransactionBundle` / `buildAuthorizeUrl` / `intakeResponse` / `detectLaunchCallbackMode`）與 `gcm-config.ts`（端點常數 + 合作機構清單）。新建 `/launch/` 頁（`LaunchCallback.svelte` 島）分流 GCM 上傳與 fhirclient callback。共用 `GcmUploadForm.svelte` 嵌入 `ResultView` 與 `ResultViewWrapper`。跨 redirect 只存 `assessmentId`，callback 後從 IndexedDB 重建上傳 Bundle。

**Tech Stack:** Astro 5 + Svelte 5 runes、TypeScript strict、Dexie/IndexedDB、fhirclient（既有）、原生 fetch + WebCrypto（GCM）、vitest + @testing-library/svelte + fake-indexeddb。

**Spec:** `docs/superpowers/specs/2026-06-01-gcm-intake-integration-design.md`

---

## File Structure

**新增：**
- `src/lib/fhir/gcm-config.ts` — GCM 端點常數 + `PARTNER_INTAKE_POINTS`。
- `src/lib/fhir/gcm-submit.ts` — PKCE/註冊/授權/上傳核心 + 純函數。
- `src/components/fhir/LaunchCallback.svelte` — callback 分流島。
- `src/pages/launch/index.astro` — 載入 `LaunchCallback`。
- `src/components/assess/GcmUploadForm.svelte` — 共用上傳表單。
- `tests/lib/fhir/gcm-submit.test.ts` — 核心純函數 + 流程測試。
- `tests/lib/fhir/gcm-config.test.ts` — 設定守門測試。
- `tests/lib/db/gcm-submitted.test.ts` — `markGcmSubmitted` 測試。
- `tests/components/GcmUploadForm.test.ts` — 表單元件測試。

**變更：**
- `src/lib/db/schema.ts` — `Assessment` 加 `gcmCaseId?` / `gcmSubmittedAt?`。
- `src/lib/db/assessments.ts` — `markGcmSubmitted(id, caseId)`。
- `src/lib/stores/auth.svelte.ts` — `hydrateFromSession()`。
- `src/lib/fhir/launch.ts` — `handleCallback()` 回傳加 `serverUrl`。
- `src/components/assess/ResultView.svelte` — 嵌 `GcmUploadForm`。
- `src/components/assess/ResultViewWrapper.svelte` — 嵌 `GcmUploadForm`。

---

## Task 1: GCM 設定常數與合作機構清單

**Files:**
- Create: `src/lib/fhir/gcm-config.ts`
- Test: `tests/lib/fhir/gcm-config.test.ts`

- [ ] **Step 1: 寫失敗測試**

```ts
// tests/lib/fhir/gcm-config.test.ts
import { describe, it, expect } from 'vitest';
import { GCM, PARTNER_INTAKE_POINTS } from '../../../src/lib/fhir/gcm-config';

describe('gcm-config', () => {
  it('base 與 intakeUrl 固定', () => {
    expect(GCM.base).toBe('https://gcm.fhir.yao.care');
    expect(GCM.intakeUrl).toBe('https://gcm.org.tw/fhir/Questionnaire/gcm-intake');
  });

  it('scopes 不含 openid / fhirUser（GCM 不支援 OIDC）', () => {
    expect(GCM.scopes).not.toMatch(/openid/);
    expect(GCM.scopes).not.toMatch(/fhirUser/);
    expect(GCM.scopes).toContain('launch/patient');
    expect(GCM.scopes).toContain('patient/Observation.c');
    expect(GCM.scopes).toContain('offline_access');
  });

  it('PARTNER_INTAKE_POINTS 含 gcm 條目', () => {
    const gcm = PARTNER_INTAKE_POINTS.find(p => p.id === 'gcm');
    expect(gcm).toBeDefined();
    expect(gcm?.fhirBaseUrl).toBe('https://gcm.fhir.yao.care');
    expect(gcm?.requiredScopes).toBe(GCM.scopes);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `pnpm test -- tests/lib/fhir/gcm-config.test.ts`
Expected: FAIL — 找不到模組 `gcm-config`。

- [ ] **Step 3: 實作**

```ts
// src/lib/fhir/gcm-config.ts
/** GCM 收案 server 整合契約常數（server 已上線且固定）。 */
export const GCM = {
  base: 'https://gcm.fhir.yao.care',
  intakeUrl: 'https://gcm.org.tw/fhir/Questionnaire/gcm-intake',
  scopes:
    'launch/patient patient/Observation.c patient/DiagnosticReport.c patient/QuestionnaireResponse.c patient/Patient.u offline_access',
} as const;

export interface PartnerIntakePoint {
  id: string;
  name: string;
  fhirBaseUrl: string;
  intakeQuestionnaireUrl: string;
  requiredScopes: string;
}

/** 合作收案機構清單。目前一筆 GCM，可後續擴充。 */
export const PARTNER_INTAKE_POINTS: PartnerIntakePoint[] = [
  {
    id: 'gcm',
    name: 'GCM 預防醫學發展協會',
    fhirBaseUrl: GCM.base,
    intakeQuestionnaireUrl: GCM.intakeUrl,
    requiredScopes: GCM.scopes,
  },
];
```

- [ ] **Step 4: 跑測試確認通過**

Run: `pnpm test -- tests/lib/fhir/gcm-config.test.ts`
Expected: PASS（3 個）。

- [ ] **Step 5: commit**

```bash
git add src/lib/fhir/gcm-config.ts tests/lib/fhir/gcm-config.test.ts
git commit -m "feat(gcm): GCM 端點常數 + 合作機構清單"
```

---

## Task 2: PKCE 與 b64url helpers

**Files:**
- Create: `src/lib/fhir/gcm-submit.ts`
- Test: `tests/lib/fhir/gcm-submit.test.ts`

- [ ] **Step 1: 寫失敗測試**

```ts
// tests/lib/fhir/gcm-submit.test.ts
import { describe, it, expect } from 'vitest';
import { b64url, makePkce } from '../../../src/lib/fhir/gcm-submit';

describe('b64url', () => {
  it('產生 URL-safe base64（無 +/= ）', () => {
    const out = b64url(new Uint8Array([251, 252, 253, 254, 255]));
    expect(out).not.toMatch(/[+/=]/);
  });
});

describe('makePkce', () => {
  it('challenge = b64url(SHA-256(verifier))', async () => {
    const { verifier, challenge } = await makePkce();
    expect(verifier.length).toBeGreaterThan(20);
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    expect(challenge).toBe(b64url(new Uint8Array(digest)));
  });
});
```

> 註：若 jsdom 環境缺 `crypto.subtle`，在此測試檔頂端加 `// @vitest-environment node`。

- [ ] **Step 2: 跑測試確認失敗**

Run: `pnpm test -- tests/lib/fhir/gcm-submit.test.ts`
Expected: FAIL — 找不到模組 `gcm-submit`。

- [ ] **Step 3: 實作（建立檔案，先放 PKCE helpers）**

```ts
// src/lib/fhir/gcm-submit.ts
export function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function makePkce(): Promise<{ verifier: string; challenge: string }> {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return { verifier, challenge: b64url(new Uint8Array(digest)) };
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `pnpm test -- tests/lib/fhir/gcm-submit.test.ts`
Expected: PASS（2 個）。

- [ ] **Step 5: commit**

```bash
git add src/lib/fhir/gcm-submit.ts tests/lib/fhir/gcm-submit.test.ts
git commit -m "feat(gcm): PKCE + b64url helpers"
```

---

## Task 3: browserCode 持久化

**Files:**
- Modify: `src/lib/fhir/gcm-submit.ts`
- Test: `tests/lib/fhir/gcm-submit.test.ts`

- [ ] **Step 1: 追加失敗測試**

```ts
// 追加到 tests/lib/fhir/gcm-submit.test.ts
import { browserCode } from '../../../src/lib/fhir/gcm-submit';

describe('browserCode', () => {
  it('同一 session 回傳相同值並寫入 localStorage', () => {
    localStorage.removeItem('gcm.browserCode');
    const a = browserCode();
    const b = browserCode();
    expect(a).toBe(b);
    expect(localStorage.getItem('gcm.browserCode')).toBe(a);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `pnpm test -- tests/lib/fhir/gcm-submit.test.ts -t browserCode`
Expected: FAIL — `browserCode` is not a function。

- [ ] **Step 3: 實作（追加到 gcm-submit.ts）**

```ts
export function browserCode(): string {
  let c = localStorage.getItem('gcm.browserCode');
  if (!c) {
    c = crypto.randomUUID();
    localStorage.setItem('gcm.browserCode', c);
  }
  return c;
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `pnpm test -- tests/lib/fhir/gcm-submit.test.ts -t browserCode`
Expected: PASS。

- [ ] **Step 5: commit**

```bash
git add src/lib/fhir/gcm-submit.ts tests/lib/fhir/gcm-submit.test.ts
git commit -m "feat(gcm): browserCode 持久化"
```

---

## Task 4: intakeResponse 初診 QuestionnaireResponse builder

**Files:**
- Modify: `src/lib/fhir/gcm-submit.ts`
- Test: `tests/lib/fhir/gcm-submit.test.ts`

> 註：linkId 結構（巢狀 email-system/email-value）採指引給定值。實作 plan 完成後，線上實測前須 `GET /Questionnaire?url=...gcm-intake` 核對命名（spec §7.2）。

- [ ] **Step 1: 追加失敗測試**

```ts
// 追加到 tests/lib/fhir/gcm-submit.test.ts
import { intakeResponse } from '../../../src/lib/fhir/gcm-submit';

describe('intakeResponse', () => {
  it('email + phone 都帶時各一個 item', () => {
    const qr = intakeResponse('a@b.com', '0912345678') as any;
    expect(qr.resourceType).toBe('QuestionnaireResponse');
    expect(qr.status).toBe('completed');
    expect(qr.questionnaire).toBe('https://gcm.org.tw/fhir/Questionnaire/gcm-intake');
    const linkIds = qr.item.map((i: any) => i.linkId);
    expect(linkIds).toEqual(['email', 'phone']);
  });

  it('只帶 email 時只有 email item', () => {
    const qr = intakeResponse('a@b.com', undefined) as any;
    expect(qr.item.map((i: any) => i.linkId)).toEqual(['email']);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `pnpm test -- tests/lib/fhir/gcm-submit.test.ts -t intakeResponse`
Expected: FAIL — `intakeResponse` is not a function。

- [ ] **Step 3: 實作（追加到 gcm-submit.ts，先 import GCM）**

```ts
// 檔案頂端 import 區追加：
import { GCM } from './gcm-config';

// 追加函數：
export function intakeResponse(email?: string, phone?: string): object {
  const item: object[] = [];
  if (email) {
    item.push({
      linkId: 'email',
      item: [
        { linkId: 'email-system', answer: [{ valueString: 'email' }] },
        { linkId: 'email-value', answer: [{ valueString: email }] },
      ],
    });
  }
  if (phone) {
    item.push({
      linkId: 'phone',
      item: [
        { linkId: 'phone-system', answer: [{ valueString: 'phone' }] },
        { linkId: 'phone-value', answer: [{ valueString: phone }] },
      ],
    });
  }
  return {
    resourceType: 'QuestionnaireResponse',
    status: 'completed',
    questionnaire: GCM.intakeUrl,
    item,
  };
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `pnpm test -- tests/lib/fhir/gcm-submit.test.ts -t intakeResponse`
Expected: PASS（2 個）。

- [ ] **Step 5: commit**

```bash
git add src/lib/fhir/gcm-submit.ts tests/lib/fhir/gcm-submit.test.ts
git commit -m "feat(gcm): intakeResponse 初診 QuestionnaireResponse builder"
```

---

## Task 5: assembleTransactionBundle（關鍵純函數）

**Files:**
- Modify: `src/lib/fhir/gcm-submit.ts`
- Test: `tests/lib/fhir/gcm-submit.test.ts`

- [ ] **Step 1: 追加失敗測試**

```ts
// 追加到 tests/lib/fhir/gcm-submit.test.ts
import { assembleTransactionBundle } from '../../../src/lib/fhir/gcm-submit';
import type { Assessment } from '../../../src/lib/db/schema';
import type { TriageResult } from '../../../src/engine/cdsa/triage';

function makeAssessment(): Assessment {
  const now = new Date('2026-06-01T10:00:00Z');
  return {
    id: 'aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee',
    childId: 'child-1',
    status: 'completed',
    language: 'zh-TW',
    currentStep: 6,
    startedAt: now,
    completedAt: new Date('2026-06-01T10:20:00Z'),
    fhirSubmitted: false,
    createdAt: now,
    updatedAt: now,
  };
}

function makeTriage(): TriageResult {
  return {
    category: 'monitor',
    confidence: 0.8,
    summary: '部分面向需追蹤',
    anomalyCount: 1,
    details: [
      { domain: 'fine_motor', metric: 'drawingScore', value: 40, zScore: -1.2, directionalZ: -1.2, isAnomaly: true },
      { domain: 'language', metric: 'questionnaire', value: 8, zScore: 0.5, directionalZ: 0.5, isAnomaly: false },
    ],
  } as TriageResult;
}

describe('assembleTransactionBundle', () => {
  it('是 transaction Bundle，每個 entry 帶 request.method=POST', () => {
    const bundle = assembleTransactionBundle(makeAssessment(), makeTriage()) as any;
    expect(bundle.resourceType).toBe('Bundle');
    expect(bundle.type).toBe('transaction');
    for (const e of bundle.entry) {
      expect(e.request.method).toBe('POST');
      expect(typeof e.request.url).toBe('string');
      expect(e.fullUrl).toMatch(/^urn:uuid:/);
    }
  });

  it('DiagnosticReport.result 以 urn:uuid reference 對齊各 Observation entry', () => {
    const bundle = assembleTransactionBundle(makeAssessment(), makeTriage()) as any;
    const obsEntries = bundle.entry.filter((e: any) => e.resource.resourceType === 'Observation');
    const report = bundle.entry.find((e: any) => e.resource.resourceType === 'DiagnosticReport').resource;
    const obsUrns = obsEntries.map((e: any) => e.fullUrl).sort();
    const refUrns = report.result.map((r: any) => r.reference).sort();
    expect(obsEntries.length).toBe(2);
    expect(refUrns).toEqual(obsUrns);
  });

  it('無 intake 時不含 QuestionnaireResponse；有 intake 時含且排在最前', () => {
    const without = assembleTransactionBundle(makeAssessment(), makeTriage()) as any;
    expect(without.entry.some((e: any) => e.resource.resourceType === 'QuestionnaireResponse')).toBe(false);

    const withIntake = assembleTransactionBundle(makeAssessment(), makeTriage(), { email: 'a@b.com' }) as any;
    expect(withIntake.entry[0].resource.resourceType).toBe('QuestionnaireResponse');
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `pnpm test -- tests/lib/fhir/gcm-submit.test.ts -t assembleTransactionBundle`
Expected: FAIL — `assembleTransactionBundle` is not a function。

- [ ] **Step 3: 實作（追加到 gcm-submit.ts，先 import builders + 型別）**

```ts
// 檔案頂端 import 區追加：
import { buildAssessmentObservations, buildTriageDiagnosticReport } from './cdsa-resources';
import type { Assessment } from '../db/schema';
import type { TriageResult } from '../../engine/cdsa/triage';

export interface IntakeContact {
  email?: string;
  phone?: string;
}

/**
 * 把一筆 assessment + triageResult 組成 GCM transaction Bundle。
 * 因為是單次 transaction，server 端尚未配發 id，故 Observation 以
 * urn:uuid fullUrl 互相 reference；DiagnosticReport.result 覆寫成這些 urn。
 * subject 由 server 強制覆寫為 patient context，故 childId 帶現值即可。
 */
export function assembleTransactionBundle(
  assessment: Assessment,
  triageResult: TriageResult,
  intake?: IntakeContact,
): object {
  const observations = buildAssessmentObservations(assessment, assessment.childId, triageResult);
  const obsEntries = observations.map(resource => ({
    fullUrl: `urn:uuid:${crypto.randomUUID()}`,
    resource,
    request: { method: 'POST', url: 'Observation' },
  }));

  const report = buildTriageDiagnosticReport(assessment, assessment.childId, triageResult, []) as Record<string, unknown>;
  report.result = obsEntries.map(e => ({ reference: e.fullUrl }));

  const entry: object[] = [];
  if (intake && (intake.email || intake.phone)) {
    entry.push({
      fullUrl: `urn:uuid:${crypto.randomUUID()}`,
      resource: intakeResponse(intake.email, intake.phone),
      request: { method: 'POST', url: 'QuestionnaireResponse' },
    });
  }
  entry.push(...obsEntries);
  entry.push({
    fullUrl: `urn:uuid:${crypto.randomUUID()}`,
    resource: report,
    request: { method: 'POST', url: 'DiagnosticReport' },
  });

  return { resourceType: 'Bundle', type: 'transaction', entry };
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `pnpm test -- tests/lib/fhir/gcm-submit.test.ts -t assembleTransactionBundle`
Expected: PASS（3 個）。

- [ ] **Step 5: commit**

```bash
git add src/lib/fhir/gcm-submit.ts tests/lib/fhir/gcm-submit.test.ts
git commit -m "feat(gcm): assembleTransactionBundle（urn:uuid 交叉 reference）"
```

---

## Task 6: buildAuthorizeUrl 純函數

**Files:**
- Modify: `src/lib/fhir/gcm-submit.ts`
- Test: `tests/lib/fhir/gcm-submit.test.ts`

- [ ] **Step 1: 追加失敗測試**

```ts
// 追加到 tests/lib/fhir/gcm-submit.test.ts
import { buildAuthorizeUrl } from '../../../src/lib/fhir/gcm-submit';

describe('buildAuthorizeUrl', () => {
  it('組出帶 aud / S256 / login_hint / nickname 且不含 openid 的 /authorize URL', () => {
    const url = buildAuthorizeUrl({
      clientId: 'cid', redirectUri: 'https://app/launch/', state: 'st',
      challenge: 'ch', loginHint: 'bc', nickname: '小明',
    });
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe('https://gcm.fhir.yao.care/authorize');
    expect(u.searchParams.get('aud')).toBe('https://gcm.fhir.yao.care');
    expect(u.searchParams.get('response_type')).toBe('code');
    expect(u.searchParams.get('code_challenge_method')).toBe('S256');
    expect(u.searchParams.get('code_challenge')).toBe('ch');
    expect(u.searchParams.get('login_hint')).toBe('bc');
    expect(u.searchParams.get('nickname')).toBe('小明');
    expect(u.searchParams.get('scope')).not.toMatch(/openid/);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `pnpm test -- tests/lib/fhir/gcm-submit.test.ts -t buildAuthorizeUrl`
Expected: FAIL — `buildAuthorizeUrl` is not a function。

- [ ] **Step 3: 實作（追加到 gcm-submit.ts）**

```ts
export function buildAuthorizeUrl(p: {
  clientId: string;
  redirectUri: string;
  state: string;
  challenge: string;
  loginHint: string;
  nickname: string;
}): string {
  const q = new URLSearchParams({
    response_type: 'code',
    client_id: p.clientId,
    redirect_uri: p.redirectUri,
    scope: GCM.scopes,
    state: p.state,
    aud: GCM.base,
    code_challenge: p.challenge,
    code_challenge_method: 'S256',
    login_hint: p.loginHint,
    nickname: p.nickname,
  });
  return `${GCM.base}/authorize?${q.toString()}`;
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `pnpm test -- tests/lib/fhir/gcm-submit.test.ts -t buildAuthorizeUrl`
Expected: PASS。

- [ ] **Step 5: commit**

```bash
git add src/lib/fhir/gcm-submit.ts tests/lib/fhir/gcm-submit.test.ts
git commit -m "feat(gcm): buildAuthorizeUrl 純函數"
```

---

## Task 7: detectLaunchCallbackMode 純函數

**Files:**
- Modify: `src/lib/fhir/gcm-submit.ts`
- Test: `tests/lib/fhir/gcm-submit.test.ts`

- [ ] **Step 1: 追加失敗測試**

```ts
// 追加到 tests/lib/fhir/gcm-submit.test.ts
import { detectLaunchCallbackMode } from '../../../src/lib/fhir/gcm-submit';

describe('detectLaunchCallbackMode', () => {
  it('有 gcm.flow 一律走 gcm', () => {
    expect(detectLaunchCallbackMode('?code=x', true)).toBe('gcm');
    expect(detectLaunchCallbackMode('', true)).toBe('gcm');
  });
  it('無 gcm.flow 但有 code 走 fhir', () => {
    expect(detectLaunchCallbackMode('?code=x&state=y', false)).toBe('fhir');
  });
  it('皆無走 none', () => {
    expect(detectLaunchCallbackMode('', false)).toBe('none');
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `pnpm test -- tests/lib/fhir/gcm-submit.test.ts -t detectLaunchCallbackMode`
Expected: FAIL。

- [ ] **Step 3: 實作（追加到 gcm-submit.ts）**

```ts
export type LaunchCallbackMode = 'gcm' | 'fhir' | 'none';

export function detectLaunchCallbackMode(search: string, hasGcmFlow: boolean): LaunchCallbackMode {
  if (hasGcmFlow) return 'gcm';
  if (new URLSearchParams(search).has('code')) return 'fhir';
  return 'none';
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `pnpm test -- tests/lib/fhir/gcm-submit.test.ts -t detectLaunchCallbackMode`
Expected: PASS（3 個）。

- [ ] **Step 5: commit**

```bash
git add src/lib/fhir/gcm-submit.ts tests/lib/fhir/gcm-submit.test.ts
git commit -m "feat(gcm): detectLaunchCallbackMode 純函數"
```

---

## Task 8: getClientId（動態註冊 + localStorage 快取）

**Files:**
- Modify: `src/lib/fhir/gcm-submit.ts`
- Test: `tests/lib/fhir/gcm-submit.test.ts`

- [ ] **Step 1: 追加失敗測試**

```ts
// 追加到 tests/lib/fhir/gcm-submit.test.ts
import { vi } from 'vitest';
import { getClientId } from '../../../src/lib/fhir/gcm-submit';

describe('getClientId', () => {
  it('快取命中時不打 /register', async () => {
    localStorage.setItem('gcm.clientId', 'cached-cid');
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const id = await getClientId('https://app/launch/');
    expect(id).toBe('cached-cid');
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('未命中時 POST /register 並快取 client_id', async () => {
    localStorage.removeItem('gcm.clientId');
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ client_id: 'new-cid' }),
    });
    vi.stubGlobal('fetch', fetchSpy);
    const id = await getClientId('https://app/launch/');
    expect(id).toBe('new-cid');
    expect(localStorage.getItem('gcm.clientId')).toBe('new-cid');
    const [url, opts] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://gcm.fhir.yao.care/register');
    expect(JSON.parse(opts.body)).toMatchObject({
      redirect_uris: ['https://app/launch/'],
      token_endpoint_auth_method: 'none',
    });
    vi.unstubAllGlobals();
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `pnpm test -- tests/lib/fhir/gcm-submit.test.ts -t getClientId`
Expected: FAIL — `getClientId` is not a function。

- [ ] **Step 3: 實作（追加到 gcm-submit.ts）**

```ts
export async function getClientId(redirectUri: string): Promise<string> {
  const cached = localStorage.getItem('gcm.clientId');
  if (cached) return cached;
  const r = await fetch(`${GCM.base}/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ redirect_uris: [redirectUri], token_endpoint_auth_method: 'none' }),
  });
  if (!r.ok) throw new Error(`register 失敗 ${r.status}`);
  const j = await r.json();
  localStorage.setItem('gcm.clientId', j.client_id);
  return j.client_id as string;
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `pnpm test -- tests/lib/fhir/gcm-submit.test.ts -t getClientId`
Expected: PASS（2 個）。

- [ ] **Step 5: commit**

```bash
git add src/lib/fhir/gcm-submit.ts tests/lib/fhir/gcm-submit.test.ts
git commit -m "feat(gcm): getClientId 動態註冊 + 快取"
```

---

## Task 9: Assessment GCM 欄位 + markGcmSubmitted

**Files:**
- Modify: `src/lib/db/schema.ts:192-193`（`fhirDiagnosticReportId` 之後）
- Modify: `src/lib/db/assessments.ts`（`markFhirSubmitted` 之後）
- Test: `tests/lib/db/gcm-submitted.test.ts`

- [ ] **Step 1: 寫失敗測試**

```ts
// tests/lib/db/gcm-submitted.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../../src/lib/db/schema';
import { createChild, createAssessment, markGcmSubmitted, getAssessment } from '../../../src/lib/db/assessments';

describe('markGcmSubmitted', () => {
  beforeEach(async () => {
    await db.assessments.clear();
    await db.children.clear();
  });

  it('寫入 gcmCaseId 與 gcmSubmittedAt', async () => {
    await createChild({ id: 'c1', birthDate: '2022-01-01', gender: 'male', createdAt: new Date() });
    const a = await createAssessment('c1');
    await markGcmSubmitted(a.id, 'GCM-0042');
    const after = await getAssessment(a.id);
    expect(after?.gcmCaseId).toBe('GCM-0042');
    expect(after?.gcmSubmittedAt).toBeInstanceOf(Date);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `pnpm test -- tests/lib/db/gcm-submitted.test.ts`
Expected: FAIL — `markGcmSubmitted` is not exported。

- [ ] **Step 3a: schema.ts 加欄位**

在 `src/lib/db/schema.ts` 的 `fhirDiagnosticReportId?: string;`（第 193 行）之後插入：

```ts
  /** GCM 收案上傳結果：病例唯一碼（GCM-XXXX）。非索引欄位，無需 Dexie 版本升級。 */
  gcmCaseId?: string;
  gcmSubmittedAt?: Date;
```

- [ ] **Step 3b: assessments.ts 加 helper**

在 `src/lib/db/assessments.ts` 的 `markFhirSubmitted`（第 58-64 行）之後插入：

```ts
export async function markGcmSubmitted(id: string, caseId: string): Promise<void> {
  await db.assessments.update(id, {
    gcmCaseId: caseId,
    gcmSubmittedAt: new Date(),
    updatedAt: new Date(),
  });
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `pnpm test -- tests/lib/db/gcm-submitted.test.ts`
Expected: PASS。

- [ ] **Step 5: commit**

```bash
git add src/lib/db/schema.ts src/lib/db/assessments.ts tests/lib/db/gcm-submitted.test.ts
git commit -m "feat(gcm): Assessment gcmCaseId/gcmSubmittedAt + markGcmSubmitted"
```

---

## Task 10: startGcmUpload（授權導向）

**Files:**
- Modify: `src/lib/fhir/gcm-submit.ts`
- Test: `tests/lib/fhir/gcm-submit.test.ts`

- [ ] **Step 1: 追加失敗測試**

```ts
// 追加到 tests/lib/fhir/gcm-submit.test.ts
import { startGcmUpload } from '../../../src/lib/fhir/gcm-submit';

describe('startGcmUpload', () => {
  it('寫入 gcm.flow（只存 assessmentId，不存大 payload）並導向 /authorize', async () => {
    localStorage.setItem('gcm.clientId', 'cid');
    sessionStorage.removeItem('gcm.flow');
    const assign = vi.fn();
    const orig = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...orig, assign },
    });

    await startGcmUpload('https://app/launch/', {
      assessmentId: 'aid-1', nickname: '小明', email: 'a@b.com',
    });

    const flow = JSON.parse(sessionStorage.getItem('gcm.flow')!);
    expect(flow.assessmentId).toBe('aid-1');
    expect(flow.nickname).toBe('小明');
    expect(flow.clientId).toBe('cid');
    expect(flow.verifier).toBeTruthy();
    expect(flow.state).toBeTruthy();
    expect('payload' in flow).toBe(false);

    expect(assign).toHaveBeenCalledTimes(1);
    expect(assign.mock.calls[0][0]).toContain('https://gcm.fhir.yao.care/authorize');

    Object.defineProperty(window, 'location', { configurable: true, value: orig });
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `pnpm test -- tests/lib/fhir/gcm-submit.test.ts -t startGcmUpload`
Expected: FAIL — `startGcmUpload` is not a function。

- [ ] **Step 3: 實作（追加到 gcm-submit.ts）**

```ts
export interface GcmFlowState {
  verifier: string;
  state: string;
  redirectUri: string;
  clientId: string;
  assessmentId: string;
  nickname: string;
  email?: string;
  phone?: string;
}

export interface StartGcmUploadInput {
  assessmentId: string;
  nickname: string;
  email?: string;
  phone?: string;
}

export async function startGcmUpload(redirectUri: string, input: StartGcmUploadInput): Promise<void> {
  const clientId = await getClientId(redirectUri);
  const { verifier, challenge } = await makePkce();
  const state = crypto.randomUUID();
  const flow: GcmFlowState = {
    verifier, state, redirectUri, clientId,
    assessmentId: input.assessmentId,
    nickname: input.nickname,
    email: input.email,
    phone: input.phone,
  };
  sessionStorage.setItem('gcm.flow', JSON.stringify(flow));
  const url = buildAuthorizeUrl({
    clientId, redirectUri, state, challenge,
    loginHint: browserCode(), nickname: input.nickname,
  });
  window.location.assign(url);
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `pnpm test -- tests/lib/fhir/gcm-submit.test.ts -t startGcmUpload`
Expected: PASS。

- [ ] **Step 5: commit**

```bash
git add src/lib/fhir/gcm-submit.ts tests/lib/fhir/gcm-submit.test.ts
git commit -m "feat(gcm): startGcmUpload 授權導向"
```

---

## Task 11: completeGcmUpload（callback 後換 token + 重建 Bundle + 上傳）

**Files:**
- Modify: `src/lib/fhir/gcm-submit.ts`
- Test: `tests/lib/fhir/gcm-submit.test.ts`

- [ ] **Step 1: 追加失敗測試**

```ts
// 追加到 tests/lib/fhir/gcm-submit.test.ts
import { completeGcmUpload } from '../../../src/lib/fhir/gcm-submit';
import { db } from '../../../src/lib/db/schema';

describe('completeGcmUpload', () => {
  it('驗 state → 換 token → 重建 Bundle 上傳 → 回 caseId 並標記 assessment', async () => {
    // seed 一筆已完成、含 triageResult 的 assessment
    await db.assessments.clear();
    await db.children.clear();
    const assessment = makeAssessment();
    assessment.triageResult = {
      category: 'monitor', confidence: 0.8, summary: '部分面向需追蹤',
      anomalyCount: 1,
      details: [
        { domain: 'fine_motor', metric: 'drawingScore', value: 40, zScore: -1.2, directionalZ: -1.2, isAnomaly: true },
      ],
    };
    await db.assessments.put(assessment);

    sessionStorage.setItem('gcm.flow', JSON.stringify({
      verifier: 'v', state: 'st', redirectUri: 'https://app/launch/', clientId: 'cid',
      assessmentId: assessment.id, nickname: '小明', email: 'a@b.com',
    }));
    window.history.replaceState({}, '', '/launch/?code=AUTHCODE&state=st');

    let postedBundle: any = null;
    const fetchSpy = vi.fn().mockImplementation((url: string, opts: any) => {
      if (url.endsWith('/token')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({
          access_token: 'AT', patient: 'GCM-0042', refresh_token: 'RT',
        }) });
      }
      // transaction POST 到 base /
      postedBundle = JSON.parse(opts.body);
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ resourceType: 'Bundle', type: 'transaction-response' }) });
    });
    vi.stubGlobal('fetch', fetchSpy);

    const { caseId } = await completeGcmUpload();
    expect(caseId).toBe('GCM-0042');

    // 送出的是 transaction Bundle，含 intake QR + Observation + DiagnosticReport
    expect(postedBundle.type).toBe('transaction');
    const types = postedBundle.entry.map((e: any) => e.resource.resourceType);
    expect(types).toContain('QuestionnaireResponse');
    expect(types).toContain('Observation');
    expect(types).toContain('DiagnosticReport');

    // assessment 被標記
    const after = await db.assessments.get(assessment.id);
    expect(after?.gcmCaseId).toBe('GCM-0042');

    // gcm.flow 已清除
    expect(sessionStorage.getItem('gcm.flow')).toBeNull();

    vi.unstubAllGlobals();
  });

  it('state 不符時丟錯且不上傳', async () => {
    sessionStorage.setItem('gcm.flow', JSON.stringify({
      verifier: 'v', state: 'EXPECTED', redirectUri: 'https://app/launch/', clientId: 'cid',
      assessmentId: 'x', nickname: 'n',
    }));
    window.history.replaceState({}, '', '/launch/?code=c&state=WRONG');
    await expect(completeGcmUpload()).rejects.toThrow(/state/);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `pnpm test -- tests/lib/fhir/gcm-submit.test.ts -t completeGcmUpload`
Expected: FAIL — `completeGcmUpload` is not a function。

- [ ] **Step 3: 實作（追加到 gcm-submit.ts，先 import db 與 markGcmSubmitted）**

```ts
// 檔案頂端 import 區追加：
import { db } from '../db/schema';
import { markGcmSubmitted } from '../db/assessments';

export async function completeGcmUpload(): Promise<{ caseId: string; result: unknown }> {
  const raw = sessionStorage.getItem('gcm.flow');
  if (!raw) throw new Error('找不到 GCM 流程狀態');
  const flow = JSON.parse(raw) as GcmFlowState;

  const params = new URLSearchParams(window.location.search);
  if (params.get('state') !== flow.state) throw new Error('state 不符（CSRF）');
  const code = params.get('code');
  if (!code) throw new Error(params.get('error') ?? '授權未取得 code');

  // 1. 換 token
  const tok = await fetch(`${GCM.base}/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: flow.redirectUri,
      code_verifier: flow.verifier,
      client_id: flow.clientId,
    }).toString(),
  });
  if (!tok.ok) throw new Error(`token 失敗 ${tok.status}`);
  const t = await tok.json();
  const accessToken = t.access_token as string;
  const caseId = t.patient as string;

  // 2. 從 IndexedDB 重建上傳內容
  const assessment = await db.assessments.get(flow.assessmentId);
  if (!assessment) throw new Error('找不到評估資料');
  if (!assessment.triageResult) throw new Error('評估結果不完整，無法上傳');
  const bundle = assembleTransactionBundle(
    assessment,
    assessment.triageResult as unknown as TriageResult,
    { email: flow.email, phone: flow.phone },
  );

  // 3. 上傳 transaction Bundle
  const up = await fetch(`${GCM.base}/`, {
    method: 'POST',
    headers: { 'content-type': 'application/fhir+json', authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(bundle),
  });
  if (!up.ok) throw new Error(`上傳失敗 ${up.status}`);

  // 4. 標記 + 清狀態
  await markGcmSubmitted(flow.assessmentId, caseId);
  sessionStorage.removeItem('gcm.flow');
  localStorage.setItem(`gcm.case.${browserCode()}.${flow.nickname}`, caseId);
  return { caseId, result: await up.json() };
}
```

> 註：`assessment.triageResult`（schema 內嵌型別）與 `TriageResult`（engine 型別）欄位相容，故以 `as unknown as TriageResult` 轉接，與 `ResultViewWrapper` 既有做法一致。

- [ ] **Step 4: 跑測試確認通過**

Run: `pnpm test -- tests/lib/fhir/gcm-submit.test.ts -t completeGcmUpload`
Expected: PASS（2 個）。

- [ ] **Step 5: commit**

```bash
git add src/lib/fhir/gcm-submit.ts tests/lib/fhir/gcm-submit.test.ts
git commit -m "feat(gcm): completeGcmUpload 換 token + 重建 Bundle 上傳"
```

---

## Task 12: handleCallback 回傳加 serverUrl（fhirclient 補通前置）

**Files:**
- Modify: `src/lib/fhir/launch.ts:48-61`

- [ ] **Step 1: 修改 handleCallback 回傳**

把 `src/lib/fhir/launch.ts` 的 `handleCallback`（第 48-61 行）改為：

```ts
export async function handleCallback(): Promise<{
  client: Client;
  serverUrl: string;
  accessToken: string;
  fhirUser: string;
  scopes: string[];
}> {
  const client = await completeAuth();
  return {
    client,
    serverUrl: client.state.serverUrl,
    accessToken: getAccessToken(),
    fhirUser: getFhirUser(),
    scopes: getScopes(),
  };
}
```

- [ ] **Step 2: 型別檢查通過**

Run: `pnpm check`
Expected: 無新增型別錯誤（`client.state.serverUrl` 為 fhirclient `fhirclient.ClientState['serverUrl']`，型別 string）。

- [ ] **Step 3: commit**

```bash
git add src/lib/fhir/launch.ts
git commit -m "feat(fhir): handleCallback 回傳加 serverUrl（補通用）"
```

---

## Task 13: authStore.hydrateFromSession

**Files:**
- Modify: `src/lib/stores/auth.svelte.ts`
- Test: `tests/lib/fhir/auth-hydrate.test.ts`

- [ ] **Step 1: 寫失敗測試**

```ts
// tests/lib/fhir/auth-hydrate.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { authStore } from '../../../src/lib/stores/auth.svelte';

describe('authStore.hydrateFromSession', () => {
  beforeEach(() => {
    authStore.clearAuth();
    sessionStorage.clear();
  });

  it('從 sessionStorage[smartAuth] 還原 auth', () => {
    sessionStorage.setItem('smartAuth', JSON.stringify({
      accessToken: 'AT', baseUrl: 'https://h/fhir', fhirUser: 'Practitioner/1',
      scopes: ['patient/*.read'],
    }));
    authStore.hydrateFromSession();
    expect(authStore.isAuthenticated).toBe(true);
    expect(authStore.fhirBaseUrl).toBe('https://h/fhir');
  });

  it('無 smartAuth 時維持未登入', () => {
    authStore.hydrateFromSession();
    expect(authStore.isAuthenticated).toBe(false);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `pnpm test -- tests/lib/fhir/auth-hydrate.test.ts`
Expected: FAIL — `hydrateFromSession` is not a function。

- [ ] **Step 3: 實作（在 `setAuth` 之後插入兩個方法）**

在 `src/lib/stores/auth.svelte.ts` 的 `setAuth`（第 13-18 行）之後插入：

```ts
  /** 把目前 auth 寫進 sessionStorage，供跨頁（/launch/ → /workspace/）交接。 */
  persistToSession(): void {
    sessionStorage.setItem('smartAuth', JSON.stringify({
      accessToken: this.accessToken,
      baseUrl: this.fhirBaseUrl,
      fhirUser: this.fhirUser,
      scopes: this.scopes,
    }));
  }

  /** 從 sessionStorage 還原 auth（workspace 等頁掛載時呼叫）。 */
  hydrateFromSession(): void {
    const raw = sessionStorage.getItem('smartAuth');
    if (!raw) return;
    try {
      const a = JSON.parse(raw) as { accessToken: string; baseUrl: string; fhirUser: string; scopes: string[] };
      if (a.accessToken) this.setAuth(a.accessToken, a.baseUrl, a.fhirUser, a.scopes);
    } catch {
      /* 損毀的 session 資料：忽略，維持未登入 */
    }
  }
```

- [ ] **Step 4: 跑測試確認通過**

Run: `pnpm test -- tests/lib/fhir/auth-hydrate.test.ts`
Expected: PASS（2 個）。

- [ ] **Step 5: commit**

```bash
git add src/lib/stores/auth.svelte.ts tests/lib/fhir/auth-hydrate.test.ts
git commit -m "feat(fhir): authStore persistToSession + hydrateFromSession"
```

---

## Task 14: WorkspaceShell 掛載時 hydrate

**Files:**
- Modify: `src/components/workspace/WorkspaceShell.svelte:23-28`

- [ ] **Step 1: 加 hydrate $effect**

在 `src/components/workspace/WorkspaceShell.svelte` 第 22-23 行之間（`isAuth` derived 之後、既有 `$effect` 之前）插入：

```ts
  // 從 /launch/ 交接過來的 SMART auth（in-memory store 不跨頁，需從 session 還原）。
  $effect(() => {
    if (!authStore.isAuthenticated) authStore.hydrateFromSession();
  });
```

- [ ] **Step 2: 型別檢查通過**

Run: `pnpm check`
Expected: 無新增錯誤。

- [ ] **Step 3: commit**

```bash
git add src/components/workspace/WorkspaceShell.svelte
git commit -m "feat(fhir): WorkspaceShell 掛載時 hydrate SMART auth"
```

---

## Task 15: LaunchCallback 分流島

**Files:**
- Create: `src/components/fhir/LaunchCallback.svelte`

> 此元件以 redirect / fhirclient 為主，邏輯分支已由 Task 7 `detectLaunchCallbackMode` 純函數測試覆蓋；元件本身不寫單元測試（spec §10）。

- [ ] **Step 1: 實作元件**

```svelte
<!-- src/components/fhir/LaunchCallback.svelte -->
<script lang="ts">
  import { completeGcmUpload, detectLaunchCallbackMode } from '$lib/fhir/gcm-submit';
  import { handleCallback } from '$lib/fhir/launch';
  import { authStore } from '$lib/stores/auth.svelte';

  type View = 'loading' | 'gcm-success' | 'error';
  let view = $state<View>('loading');
  let caseId = $state('');
  let message = $state('');

  $effect(() => {
    void run();
  });

  async function run() {
    const hasGcmFlow = sessionStorage.getItem('gcm.flow') !== null;
    const mode = detectLaunchCallbackMode(window.location.search, hasGcmFlow);

    if (mode === 'gcm') {
      try {
        const { caseId: id } = await completeGcmUpload();
        caseId = id;
        view = 'gcm-success';
      } catch (err) {
        message = err instanceof Error ? err.message : '上傳失敗，請稍後重試';
        view = 'error';
      }
      return;
    }

    if (mode === 'fhir') {
      try {
        const { serverUrl, accessToken, fhirUser, scopes } = await handleCallback();
        authStore.setAuth(accessToken, serverUrl, fhirUser, scopes);
        authStore.persistToSession();
        window.location.assign('/workspace/');
      } catch (err) {
        message = err instanceof Error ? err.message : '醫院連線失敗，請重試';
        view = 'error';
      }
      return;
    }

    // none：非預期進入此頁
    message = '沒有可處理的授權回呼。';
    view = 'error';
  }
</script>

<div class="launch-callback">
  {#if view === 'loading'}
    <p class="status">正在處理…請稍候</p>
  {:else if view === 'gcm-success'}
    <div class="success-box" role="status">
      <h2>已收案</h2>
      <p>收案編號：<strong>{caseId}</strong></p>
      <p class="muted">請保留此編號，複診時以相同暱稱上傳會歸入同一病例。</p>
      <a href="/history/" class="btn">查看評估紀錄</a>
    </div>
  {:else}
    <div class="error-box" role="alert">
      <p>{message}</p>
      <a href="/history/" class="btn">返回評估紀錄</a>
    </div>
  {/if}
</div>

<style>
  .launch-callback {
    max-width: 480px;
    margin: 0 auto;
    padding: var(--space-8) var(--space-4);
    text-align: center;
  }
  .status {
    font-size: var(--text-base);
    color: color-mix(in srgb, var(--text), var(--bg) 30%);
  }
  .success-box h2 {
    font-size: var(--text-2xl);
    color: var(--accent);
    margin-bottom: var(--space-3);
  }
  .success-box p,
  .error-box p {
    font-size: var(--text-base);
    margin-bottom: var(--space-3);
  }
  .muted {
    font-size: var(--text-sm);
    color: color-mix(in srgb, var(--text), var(--bg) 30%);
  }
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 48px;
    min-width: 200px;
    padding: var(--space-3) var(--space-7);
    background: var(--accent);
    color: white;
    border-radius: var(--radius-md);
    text-decoration: none;
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
  }
</style>
```

- [ ] **Step 2: 型別檢查通過**

Run: `pnpm check`
Expected: 無新增錯誤。

- [ ] **Step 3: commit**

```bash
git add src/components/fhir/LaunchCallback.svelte
git commit -m "feat(gcm): LaunchCallback 分流島（GCM 上傳 + fhirclient 補通）"
```

---

## Task 16: /launch/ 頁面

**Files:**
- Create: `src/pages/launch/index.astro`

- [ ] **Step 1: 實作頁面（沿用 result/index.astro 結構）**

```astro
---
import Base from '../../layouts/Base.astro';
import Header from '../../components/blocks/Header.astro';
import LaunchCallback from '../../components/fhir/LaunchCallback.svelte';
---

<Base title="處理授權回呼" description="SMART on FHIR 授權回呼處理" noindex>
  <meta slot="head" name="referrer" content="no-referrer" />
  <div class="app-layout">
    <Header />
    <main id="main-content" class="app-main">
      <LaunchCallback client:load />
    </main>
  </div>
</Base>

<style>
  .app-layout {
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
  }
  .app-main {
    flex: 1;
    padding: var(--space-6) var(--space-4);
    max-width: 960px;
    width: 100%;
    margin: 0 auto;
  }
</style>
```

- [ ] **Step 2: build 通過（確認頁面被產生）**

Run: `pnpm build`
Expected: 成功；`dist/launch/index.html` 存在。

- [ ] **Step 3: commit**

```bash
git add src/pages/launch/index.astro
git commit -m "feat(gcm): 新建 /launch/ callback 頁"
```

---

## Task 17: GcmUploadForm 共用表單元件

**Files:**
- Create: `src/components/assess/GcmUploadForm.svelte`
- Test: `tests/components/GcmUploadForm.test.ts`

- [ ] **Step 1: 寫失敗測試**

```ts
// tests/components/GcmUploadForm.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/svelte';
import GcmUploadForm from '../../src/components/assess/GcmUploadForm.svelte';

vi.mock('../../src/lib/fhir/gcm-submit', () => ({
  startGcmUpload: vi.fn().mockResolvedValue(undefined),
}));
import { startGcmUpload } from '../../src/lib/fhir/gcm-submit';

describe('GcmUploadForm', () => {
  beforeEach(() => vi.clearAllMocks());

  it('暱稱空白時不呼叫 startGcmUpload', async () => {
    render(GcmUploadForm, { props: { assessmentId: 'aid-1' } });
    await fireEvent.click(screen.getByRole('button', { name: /上傳到 GCM/ }));
    expect(startGcmUpload).not.toHaveBeenCalled();
  });

  it('填暱稱後呼叫 startGcmUpload 並帶 assessmentId', async () => {
    render(GcmUploadForm, { props: { assessmentId: 'aid-1' } });
    await fireEvent.input(screen.getByLabelText(/暱稱/), { target: { value: '小明' } });
    await fireEvent.click(screen.getByRole('button', { name: /上傳到 GCM/ }));
    expect(startGcmUpload).toHaveBeenCalledTimes(1);
    const [, payload] = (startGcmUpload as any).mock.calls[0];
    expect(payload).toMatchObject({ assessmentId: 'aid-1', nickname: '小明' });
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `pnpm test -- tests/components/GcmUploadForm.test.ts`
Expected: FAIL — 找不到元件。

- [ ] **Step 3: 實作元件**

```svelte
<!-- src/components/assess/GcmUploadForm.svelte -->
<script lang="ts">
  import { startGcmUpload } from '$lib/fhir/gcm-submit';

  let { assessmentId, alreadySubmitted = false, caseId = '' }: {
    assessmentId: string;
    alreadySubmitted?: boolean;
    caseId?: string;
  } = $props();

  let nickname = $state('');
  let email = $state('');
  let phone = $state('');
  let submitting = $state(false);
  let error = $state<string | null>(null);

  const redirectUri = $derived(
    typeof window !== 'undefined' ? `${window.location.origin}/launch/` : '',
  );

  async function submit() {
    error = null;
    if (!nickname.trim()) {
      error = '請填寫暱稱';
      return;
    }
    submitting = true;
    try {
      await startGcmUpload(redirectUri, {
        assessmentId,
        nickname: nickname.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
      });
      // startGcmUpload 會 redirect 離開本頁，正常情況下不會走到這裡
    } catch (err) {
      error = err instanceof Error ? err.message : '無法開始上傳，請稍後重試';
      submitting = false;
    }
  }
</script>

<section class="gcm-upload" aria-label="上傳到 GCM 收案">
  <h3>上傳到 GCM 預防醫學發展協會</h3>
  {#if alreadySubmitted}
    <p class="gcm-done">已收案，編號 <strong>{caseId}</strong></p>
  {:else}
    <p class="gcm-hint">填寫暱稱即可建立／延續您的病例（email、電話選填，供協會聯繫）。</p>
    <label class="field">
      <span>暱稱（必填）</span>
      <input type="text" bind:value={nickname} autocomplete="off" />
    </label>
    <label class="field">
      <span>Email（選填）</span>
      <input type="email" bind:value={email} autocomplete="off" />
    </label>
    <label class="field">
      <span>電話（選填）</span>
      <input type="tel" bind:value={phone} autocomplete="off" />
    </label>
    {#if error}<p class="gcm-error">{error}</p>{/if}
    <button class="btn-gcm" onclick={submit} disabled={submitting}>
      {submitting ? '前往授權…' : '上傳到 GCM 收案'}
    </button>
  {/if}
</section>

<style>
  .gcm-upload {
    width: 100%;
    max-width: 420px;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-5);
    border: 1px solid var(--line);
    border-radius: var(--radius-md);
    background: var(--surface);
  }
  .gcm-upload h3 {
    font-size: var(--text-base);
    font-weight: var(--font-medium);
  }
  .gcm-hint {
    font-size: var(--text-sm);
    color: color-mix(in srgb, var(--text), var(--bg) 30%);
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    font-size: var(--text-sm);
  }
  .field input {
    min-height: 44px;
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
    font-size: var(--text-base);
    background: var(--bg);
    color: var(--text);
  }
  .btn-gcm {
    min-height: 48px;
    padding: var(--space-3) var(--space-7);
    background: var(--accent);
    color: white;
    border: none;
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    cursor: pointer;
  }
  .btn-gcm:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  .gcm-error {
    font-size: var(--text-sm);
    color: var(--danger);
  }
  .gcm-done {
    font-size: var(--text-sm);
    color: var(--accent);
    font-weight: var(--font-medium);
  }
</style>
```

- [ ] **Step 4: 跑測試確認通過**

Run: `pnpm test -- tests/components/GcmUploadForm.test.ts`
Expected: PASS（2 個）。

- [ ] **Step 5: commit**

```bash
git add src/components/assess/GcmUploadForm.svelte tests/components/GcmUploadForm.test.ts
git commit -m "feat(gcm): GcmUploadForm 共用上傳表單"
```

---

## Task 18: 嵌入 ResultView

**Files:**
- Modify: `src/components/assess/ResultView.svelte`

- [ ] **Step 1: import**

在 `src/components/assess/ResultView.svelte` 第 12 行（`TriggerVideoList` import 之後）插入：

```ts
  import GcmUploadForm from './GcmUploadForm.svelte';
```

- [ ] **Step 2: 嵌入 result-actions**

在 `src/components/assess/ResultView.svelte` 的 `{#if fhirError}...{/if}`（第 175-177 行）之後、`AssessmentPdfReport` 區塊之前插入：

```svelte
    {#if assessmentStore.assessment}
      <GcmUploadForm assessmentId={assessmentStore.assessment.id} />
    {/if}
```

- [ ] **Step 3: 既有 ResultView 測試仍通過**

Run: `pnpm test -- tests/components/ResultView.test.ts`
Expected: PASS（既有測試不受影響）。

- [ ] **Step 4: commit**

```bash
git add src/components/assess/ResultView.svelte
git commit -m "feat(gcm): ResultView 嵌入 GcmUploadForm"
```

---

## Task 19: 嵌入 ResultViewWrapper（含已收案狀態）

**Files:**
- Modify: `src/components/assess/ResultViewWrapper.svelte`

- [ ] **Step 1: import**

在 `src/components/assess/ResultViewWrapper.svelte` 第 8 行（`TriggerVideoList` import 之後）插入：

```ts
  import GcmUploadForm from './GcmUploadForm.svelte';
```

- [ ] **Step 2: 嵌入 result-actions**

在 `src/components/assess/ResultViewWrapper.svelte` 的 `result-actions` div 內、`AssessmentPdfReport` 區塊（第 158-160 行）之後插入：

```svelte
      {#if assessment}
        <GcmUploadForm
          assessmentId={assessment.id}
          alreadySubmitted={!!assessment.gcmCaseId}
          caseId={assessment.gcmCaseId ?? ''}
        />
      {/if}
```

- [ ] **Step 3: 型別檢查 + build**

Run: `pnpm check`
Expected: 無新增錯誤（`assessment.gcmCaseId` 由 Task 9 加入 schema）。

- [ ] **Step 4: commit**

```bash
git add src/components/assess/ResultViewWrapper.svelte
git commit -m "feat(gcm): ResultViewWrapper 嵌入 GcmUploadForm（含已收案狀態）"
```

---

## Task 20: 全量驗證

- [ ] **Step 1: 全測試**

Run: `pnpm test`
Expected: 全綠（含新增測試 + 既有測試）。

- [ ] **Step 2: 型別 + lint**

Run: `pnpm check && pnpm lint`
Expected: 無錯誤、無 `any` 違規。

- [ ] **Step 3: build**

Run: `pnpm build`
Expected: 成功，`dist/launch/index.html` 存在。

- [ ] **Step 4: 線上契約核對（spec §7，依工作守則直接對 live 實例）**

Run:
```bash
curl -s -XPOST https://gcm.fhir.yao.care/register -H 'content-type: application/json' \
  -d '{"redirect_uris":["https://smart-pedi-cds.yao.care/launch/"],"token_endpoint_auth_method":"none"}'
curl -s 'https://gcm.fhir.yao.care/Questionnaire?url=https://gcm.org.tw/fhir/Questionnaire/gcm-intake'
```
Expected: `/register` 回 `client_id`；`Questionnaire` 回 SDC 定義。核對 intake `linkId` 命名是否與 `intakeResponse()`（Task 4）一致；核對 GCM repo `scripts/conformance-check.mjs` 的 Bundle entry 是否帶 `request`。若不一致 → 回 Task 4 / Task 5 調整並補測試。

- [ ] **Step 5: 最終 commit（若 §7 核對有調整才需要）**

```bash
git add -A
git commit -m "fix(gcm): 依線上契約核對調整 intake linkId / Bundle 形狀"
```

---

## 完成標準

- 家長在 `ResultView` 與 `ResultViewWrapper` 皆可填暱稱/email/電話並上傳到 GCM。
- 上傳走動態註冊 + PKCE/S256，`aud` = `https://gcm.fhir.yao.care`，不含 `openid`/`fhirUser`。
- callback 在 `/launch/` 分流：GCM 模式上傳後顯示收案編號；fhirclient 模式補通並導回 `/workspace/`（auth 跨頁 hydrate）。
- 跨 redirect 只存 `assessmentId`，callback 後從 IndexedDB 重建 transaction Bundle。
- 全測試/型別/lint/build 綠燈；線上契約（§7 兩點）已核對。
