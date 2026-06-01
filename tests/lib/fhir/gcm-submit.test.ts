import { describe, it, expect, vi } from 'vitest';
import { browserCode, intakeResponse, assembleTransactionBundle, buildAuthorizeUrl, detectLaunchCallbackMode } from '../../../src/lib/fhir/gcm-submit';
import type { Assessment } from '../../../src/lib/db/schema';
import type { TriageResult } from '../../../src/engine/cdsa/triage';

describe('browserCode', () => {
  it('同一 session 回傳相同值並寫入 localStorage', () => {
    localStorage.removeItem('gcm.browserCode');
    const a = browserCode();
    const b = browserCode();
    expect(a).toBe(b);
    expect(localStorage.getItem('gcm.browserCode')).toBe(a);
  });
});

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

// ---------------------------------------------------------------------------
// Task 8: getClientId
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Task 10: startGcmUpload
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Task 11: completeGcmUpload
// ---------------------------------------------------------------------------

import { completeGcmUpload } from '../../../src/lib/fhir/gcm-submit';
import { db } from '../../../src/lib/db/schema';

describe('completeGcmUpload', () => {
  it('驗 state → 換 token → 重建 Bundle 上傳 → 回 caseId 並標記 assessment', async () => {
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

    let postedBundle: unknown = null;
    const fetchSpy = vi.fn().mockImplementation((url: string, opts: { body: string }) => {
      if (url.endsWith('/token')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({
          access_token: 'AT', patient: 'GCM-0042', refresh_token: 'RT',
        }) });
      }
      postedBundle = JSON.parse(opts.body);
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ resourceType: 'Bundle', type: 'transaction-response' }) });
    });
    vi.stubGlobal('fetch', fetchSpy);

    const { caseId } = await completeGcmUpload();
    expect(caseId).toBe('GCM-0042');

    const bundle = postedBundle as { type: string; entry: Array<{ resource: { resourceType: string } }> };
    expect(bundle.type).toBe('transaction');
    const types = bundle.entry.map((e) => e.resource.resourceType);
    expect(types).toContain('QuestionnaireResponse');
    expect(types).toContain('Observation');
    expect(types).toContain('DiagnosticReport');

    const after = await db.assessments.get(assessment.id);
    expect(after?.gcmCaseId).toBe('GCM-0042');
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

  it('gcm.flow 不存在時丟錯', async () => {
    sessionStorage.removeItem('gcm.flow');
    await expect(completeGcmUpload()).rejects.toThrow(/流程狀態/);
  });

  it('token 非 ok 時丟錯', async () => {
    sessionStorage.setItem('gcm.flow', JSON.stringify({
      verifier: 'v', state: 'st', redirectUri: 'https://app/launch/', clientId: 'cid',
      assessmentId: 'x', nickname: 'n',
    }));
    window.history.replaceState({}, '', '/launch/?code=c&state=st');
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      if (url.endsWith('/token')) return Promise.resolve({ ok: false, status: 400 });
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    }));
    await expect(completeGcmUpload()).rejects.toThrow(/token 失敗/);
    vi.unstubAllGlobals();
  });

  it('token 回應缺 patient 時丟錯', async () => {
    sessionStorage.setItem('gcm.flow', JSON.stringify({
      verifier: 'v', state: 'st', redirectUri: 'https://app/launch/', clientId: 'cid',
      assessmentId: 'x', nickname: 'n',
    }));
    window.history.replaceState({}, '', '/launch/?code=c&state=st');
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      if (url.endsWith('/token')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ access_token: 'AT' }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    }));
    await expect(completeGcmUpload()).rejects.toThrow(/patient/);
    vi.unstubAllGlobals();
  });

  it('找不到 assessment 時丟錯', async () => {
    await db.assessments.clear();
    sessionStorage.setItem('gcm.flow', JSON.stringify({
      verifier: 'v', state: 'st', redirectUri: 'https://app/launch/', clientId: 'cid',
      assessmentId: 'missing-id', nickname: 'n',
    }));
    window.history.replaceState({}, '', '/launch/?code=c&state=st');
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      if (url.endsWith('/token')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ access_token: 'AT', patient: 'GCM-1' }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    }));
    await expect(completeGcmUpload()).rejects.toThrow(/找不到評估資料/);
    vi.unstubAllGlobals();
  });

  it('assessment 無 triageResult 時丟錯', async () => {
    await db.assessments.clear();
    const assessment = makeAssessment();
    // no triageResult set
    await db.assessments.put(assessment);
    sessionStorage.setItem('gcm.flow', JSON.stringify({
      verifier: 'v', state: 'st', redirectUri: 'https://app/launch/', clientId: 'cid',
      assessmentId: assessment.id, nickname: 'n',
    }));
    window.history.replaceState({}, '', '/launch/?code=c&state=st');
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      if (url.endsWith('/token')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ access_token: 'AT', patient: 'GCM-1' }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    }));
    await expect(completeGcmUpload()).rejects.toThrow(/評估結果不完整/);
    vi.unstubAllGlobals();
  });

  it('上傳非 ok 時保留 gcm.flow 供重試', async () => {
    await db.assessments.clear();
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
      assessmentId: assessment.id, nickname: 'n',
    }));
    window.history.replaceState({}, '', '/launch/?code=c&state=st');
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      if (url.endsWith('/token')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ access_token: 'AT', patient: 'GCM-1' }) });
      }
      // bundle POST
      return Promise.resolve({ ok: false, status: 422 });
    }));
    await expect(completeGcmUpload()).rejects.toThrow(/上傳失敗/);
    expect(sessionStorage.getItem('gcm.flow')).not.toBeNull();
    vi.unstubAllGlobals();
  });
});

// ---------------------------------------------------------------------------
// getClientId error-path tests
// ---------------------------------------------------------------------------

describe('getClientId — 錯誤路徑', () => {
  it('register 回應缺 client_id 時丟錯且不污染快取', async () => {
    localStorage.removeItem('gcm.clientId');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    }));
    await expect(getClientId('https://app/launch/')).rejects.toThrow(/client_id/);
    expect(localStorage.getItem('gcm.clientId')).toBeNull();
    vi.unstubAllGlobals();
  });

  it('register 非 ok 時丟錯', async () => {
    localStorage.removeItem('gcm.clientId');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    await expect(getClientId('https://app/launch/')).rejects.toThrow(/register 失敗/);
    vi.unstubAllGlobals();
  });
});
