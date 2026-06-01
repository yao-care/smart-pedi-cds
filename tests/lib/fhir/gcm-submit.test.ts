// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
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

import { browserCode, intakeResponse, assembleTransactionBundle, buildAuthorizeUrl, detectLaunchCallbackMode } from '../../../src/lib/fhir/gcm-submit';
import type { Assessment } from '../../../src/lib/db/schema';
import type { TriageResult } from '../../../src/engine/cdsa/triage';

describe('browserCode', () => {
  it('同一 session 回傳相同值並寫入 localStorage', () => {
    // Node env: shim localStorage for this test
    const store: Record<string, string> = {};
    const ls = {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => { store[k] = v; },
      removeItem: (k: string) => { delete store[k]; },
    };
    vi.stubGlobal('localStorage', ls);

    ls.removeItem('gcm.browserCode');
    const a = browserCode();
    const b = browserCode();
    expect(a).toBe(b);
    expect(ls.getItem('gcm.browserCode')).toBe(a);

    vi.unstubAllGlobals();
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
