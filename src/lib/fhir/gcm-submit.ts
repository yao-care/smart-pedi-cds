import { GCM } from './gcm-config';
import { buildAssessmentObservations, buildTriageDiagnosticReport } from './cdsa-resources';
import type { Assessment } from '../db/schema';
import type { TriageResult } from '../../engine/cdsa/triage';
import { db } from '../db/schema';
import { markGcmSubmitted } from '../db/assessments';

// ---------------------------------------------------------------------------
// Task 2: PKCE + b64url helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Task 3: browserCode 持久化
// ---------------------------------------------------------------------------

/** 取得（或首次建立並持久化）此瀏覽器的匿名識別碼，存於 localStorage。 */
export function browserCode(): string {
  let c = localStorage.getItem('gcm.browserCode');
  if (!c) {
    c = crypto.randomUUID();
    localStorage.setItem('gcm.browserCode', c);
  }
  return c;
}

// ---------------------------------------------------------------------------
// Task 4: intakeResponse builder
// ---------------------------------------------------------------------------

/**
 * 初診 QuestionnaireResponse（帶 email/phone，供 server $extract 寫入 Patient.telecom）。
 * 刻意不帶 subject：GCM server 會把 transaction 內每個資源的 subject 強制覆寫為
 * patient context（瀏覽器碼+暱稱 match-or-create），故 app 不需、也不應自算 subject。
 */
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

// ---------------------------------------------------------------------------
// Task 5: assembleTransactionBundle (KEY pure function)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Task 6: buildAuthorizeUrl
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Task 7: detectLaunchCallbackMode
// ---------------------------------------------------------------------------

export type LaunchCallbackMode = 'gcm' | 'fhir' | 'none';

export function detectLaunchCallbackMode(search: string, hasGcmFlow: boolean): LaunchCallbackMode {
  if (hasGcmFlow) return 'gcm';
  if (new URLSearchParams(search).has('code')) return 'fhir';
  return 'none';
}

// ---------------------------------------------------------------------------
// Task 8: getClientId（動態註冊 + localStorage 快取）
// ---------------------------------------------------------------------------

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
  if (!j.client_id) throw new Error('register 回應缺少 client_id');
  localStorage.setItem('gcm.clientId', j.client_id);
  return j.client_id as string;
}

// ---------------------------------------------------------------------------
// Task 10: startGcmUpload（授權導向）
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Task 11: completeGcmUpload（callback 換 token + 重建 Bundle 上傳）
// ---------------------------------------------------------------------------

export async function completeGcmUpload(): Promise<{ caseId: string; result: unknown }> {
  const raw = sessionStorage.getItem('gcm.flow');
  if (!raw) throw new Error('找不到 GCM 流程狀態');
  const flow = JSON.parse(raw) as GcmFlowState;

  const params = new URLSearchParams(window.location.search);
  if (params.get('state') !== flow.state) throw new Error('state 不符（CSRF）');
  const code = params.get('code');
  if (!code) throw new Error(params.get('error') ?? '授權未取得 code');

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
  if (!caseId) throw new Error('token 回應缺少 patient context');

  const assessment = await db.assessments.get(flow.assessmentId);
  if (!assessment) throw new Error('找不到評估資料');
  if (!assessment.triageResult) throw new Error('評估結果不完整，無法上傳');
  const bundle = assembleTransactionBundle(
    assessment,
    assessment.triageResult as unknown as TriageResult,
    { email: flow.email, phone: flow.phone },
  );

  const up = await fetch(`${GCM.base}/`, {
    method: 'POST',
    headers: { 'content-type': 'application/fhir+json', authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(bundle),
  });
  if (!up.ok) throw new Error(`上傳失敗 ${up.status}`);

  await markGcmSubmitted(flow.assessmentId, caseId);
  sessionStorage.removeItem('gcm.flow');
  let result: unknown = null;
  try {
    result = await up.json();
  } catch {
    /* 上傳已成功（up.ok）；回應 body 解析失敗不影響結果 */
  }
  return { caseId, result };
}
