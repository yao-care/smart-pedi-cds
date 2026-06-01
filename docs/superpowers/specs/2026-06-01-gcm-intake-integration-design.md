# GCM 收案 server 串接 — 設計 spec

> 日期：2026-06-01
> 狀態：設計拍板，待寫實作 plan
> 緣由：患者本地完成評估後，可選「GCM 預防醫學發展協會」為收案點，把評估結果以標準 SMART on FHIR（動態註冊 + PKCE）上傳到 `https://gcm.fhir.yao.care`。既有「醫院 FHIR server」的 fhirclient 流程保留並**順手補通**（見 §8）。

## 1. 目標與範圍

### 做什麼
- 患者在評估結果頁（即時 `ResultView` 與歷史 `ResultViewWrapper` 兩處）可選擇上傳到 GCM。
- 上傳走 GCM 專用模組（原生 `fetch` + `crypto.subtle` PKCE），**不用 fhirclient**（因要帶自訂 `login_hint` / `nickname`）。
- 身分由 GCM server 以 `(瀏覽器唯一碼, 暱稱)` match-or-create，回傳病例唯一碼 `GCM-XXXX`。
- 順手補通既有醫院 fhirclient standalone callback（目前是未接通的半成品，見 §8）。

### 不做什麼（YAGNI）
- 不送 `openid` / `fhirUser` scope（GCM 不支援 OIDC）。
- 不自組 Patient 當身分（身分＝瀏覽器碼＋暱稱＋初診 QuestionnaireResponse；server `$extract` 補 Patient）。
- 不改既有 `cdsa-resources.ts` 的 builder（沿用，僅在 gcm-submit 內後處理）。
- 不改 `CODE_SYSTEM`（維持 `https://smart-pedi-cds.yao.care/code`）。
- 不做離線 sync queue 整合（GCM 上傳需互動授權，本期僅線上即時上傳）。

## 2. 整合契約（GCM server 已上線且固定）

Base：`https://gcm.fhir.yao.care`

| 端點 | 用途 |
|---|---|
| `POST /register`（JSON） | RFC 7591 動態註冊 → `client_id`（public client，`token_endpoint_auth_method: none`） |
| `GET /authorize` | 授權碼 + PKCE/S256；`login_hint`(瀏覽器碼) + `nickname` 建立 patient context，兩者都帶時直接 302 回 `code` |
| `POST /token`（urlencoded） | 換 `access_token` + `patient`(=病例唯一碼 `GCM-XXXX`) + `refresh_token` |
| `GET /Questionnaire?url=https://gcm.org.tw/fhir/Questionnaire/gcm-intake` | 初診表單（SDC），驗證 intake linkId 用 |
| `POST /`（Bearer，transaction Bundle） | 上傳；server `$extract` 補 Patient、建立 Observation/DiagnosticReport |

要請求的 scope（**勿帶 `openid` / `fhirUser`**）：
```
launch/patient patient/Observation.c patient/DiagnosticReport.c patient/QuestionnaireResponse.c patient/Patient.u offline_access
```

身分與行為要點：
- `aud` 必須等於 `https://gcm.fhir.yao.care`。
- patient context 由 server 以 `(瀏覽器唯一碼, 暱稱)` match-or-create。
- `POST /token` 回的 `patient` = 病例唯一碼；同一 `(瀏覽器碼, 暱稱)` 複診回同一個。
- transaction 內各資源的 `subject` 會被 server **強制設為 patient context**，故 app 不必算對 subject。
- 只處理 `Observation` / `DiagnosticReport` / `QuestionnaireResponse`；其他型別回 422。
- email / 電話以 `QuestionnaireResponse` 帶上，server `$extract` 寫進 `Patient.telecom`。

### 本專案變數
| 變數 | 值 |
|---|---|
| `ORIGIN` | `https://smart-pedi-cds.yao.care` |
| `REDIRECT_URI` | `${location.origin}/launch/`（astro base = `/`，動態註冊會登記此值） |
| `CODE_SYSTEM` | `https://smart-pedi-cds.yao.care/code`（不改） |
| client_id | 動態註冊取得並快取於 `localStorage['gcm.clientId']` |

## 3. 探索發現（既有現況）

- `cdsa-resources.ts:45 buildAssessmentObservations(assessment, childId, triageResult)` → `Observation[]`（每個 `triageResult.details` 一筆）。
- `cdsa-resources.ts:108 buildTriageDiagnosticReport(assessment, childId, triageResult, observationIds)` → `DiagnosticReport`，其 `result` 寫死為 `observationIds.map(id => ({reference: 'Observation/'+id}))`（`:155`）。
- 既有上傳 `cdsa-submit.ts:39 submitAssessmentToFhir` 走「逐筆 POST 拿 server id → 組 report」，gated on `authStore.isAuthenticated`（醫師流程）。
- `ResultView.svelte` 在結果步驟用 `computeTriage(...)` 算 `triageResult` 並 `saveResult()` 寫入 IndexedDB；上傳鈕 gated on `authStore.isAuthenticated`。
- `ResultViewWrapper.svelte` 從 `?id=` 讀 `db.assessments.get(id)`（已含 `triageResult`），目前無上傳鈕。
- **既有 /launch/ callback 未接通**：`src/pages/` 無 `/launch/` 頁；`client.ts:25` redirectUri 預設 `origin + '/launch/'`；`launch.ts` 的 `handleCallback()` / `detectLaunchMode()` 與 `auth.svelte.ts` 的 `setAuth()` 皆**定義但無呼叫端** → standalone 授權走不完。
- Assessment schema `schema.ts:162` 已有 `fhirSubmitted` / `fhirDiagnosticReportId`，可鏡像加 GCM 欄位。
- 慣例：設定類資料用 localStorage、業務資料用 IndexedDB；本地 ID 一律 `crypto.randomUUID()`；POST FHIR 用 `Content-Type: application/fhir+json` + `Authorization: Bearer`。

## 4. 架構與單元邊界

### 新增檔案

**`src/lib/fhir/gcm-config.ts`** — GCM 端點常數與合作機構清單
```ts
export const GCM = {
  base: 'https://gcm.fhir.yao.care',
  intakeUrl: 'https://gcm.org.tw/fhir/Questionnaire/gcm-intake',
  scopes: 'launch/patient patient/Observation.c patient/DiagnosticReport.c patient/QuestionnaireResponse.c patient/Patient.u offline_access',
} as const;

export interface PartnerIntakePoint {
  id: string; name: string; fhirBaseUrl: string;
  intakeQuestionnaireUrl: string; requiredScopes: string;
}
export const PARTNER_INTAKE_POINTS: PartnerIntakePoint[] = [
  { id: 'gcm', name: 'GCM 預防醫學發展協會', fhirBaseUrl: GCM.base,
    intakeQuestionnaireUrl: GCM.intakeUrl, requiredScopes: GCM.scopes },
];
```

**`src/lib/fhir/gcm-submit.ts`** — 核心流程。匯出：
- `browserCode(): string` — `localStorage['gcm.browserCode']` 取/建 UUID。
- `b64url(bytes)` / `makePkce()` — `crypto.subtle.digest('SHA-256', verifier)` → S256 challenge。
- `getClientId(redirectUri): Promise<string>` — `localStorage['gcm.clientId']` 快取，未命中則 `POST /register`。
- `buildAuthorizeUrl(params): string` — **純函數**，組 `/authorize` query（response_type/client_id/redirect_uri/scope/state/aud/code_challenge/code_challenge_method/login_hint/nickname）。
- `assembleTransactionBundle(assessment, triageResult, intake?): object` — **純函數**，見 §5。
- `intakeResponse(email?, phone?): object` — 初診 QuestionnaireResponse（linkId 結構待 §7 驗證）。
- `startGcmUpload(redirectUri, { assessmentId, nickname, email?, phone? }): Promise<void>` — getClientId + PKCE + state，寫 `sessionStorage['gcm.flow']`，`location.assign(authorizeUrl)`。
- `completeGcmUpload(): Promise<{ caseId, result }>` — 讀 gcm.flow、驗 state、`POST /token`、用 `assessmentId` 從 IndexedDB 重建 Bundle、`POST /` 上傳、`markGcmSubmitted` + 寫 `localStorage['gcm.case.<bc>.<nick>']`、清 gcm.flow。

> `gcm.flow` 內容（輕量，不含大 payload）：
> `{ verifier, state, redirectUri, clientId, assessmentId, nickname, email?, phone? }`

**`src/pages/launch/index.astro`** — 載入 `LaunchCallback`（`client:load`）。

**`src/components/fhir/LaunchCallback.svelte`** — callback 分流島（見 §6）。

**`src/components/assess/GcmUploadForm.svelte`** — 共用上傳表單：暱稱（必填）+ email / 電話（選填）+「上傳到 GCM 收案」鈕。props 收 `assessmentId`。**不依賴 authStore**（家長一律可見）。已收案時顯示「已收案 編號 GCM-XXXX」。

### 變更檔案
- `src/components/assess/ResultView.svelte` — 嵌 `<GcmUploadForm assessmentId={assessment.id} />`。
- `src/components/assess/ResultViewWrapper.svelte` — 同上嵌入。
- `src/lib/db/schema.ts` — `Assessment` 加 optional `gcmCaseId?: string` / `gcmSubmittedAt?: Date`（非索引欄位 → 不需 Dexie 版本升級）。
- `src/lib/db/assessments.ts`（或對應 helper）— 新增 `markGcmSubmitted(id, caseId)`。
- `src/lib/stores/auth.svelte.ts` + `src/components/workspace/WorkspaceShell.svelte` — fhirclient 補通的 sessionStorage 交接（見 §8）。

## 5. transaction Bundle 組裝（關鍵技術點）

GCM 走**單一 transaction Bundle**，送出當下無 server id，故 DiagnosticReport 不能 reference `Observation/<server-id>`。做法：每個 Observation 配 `fullUrl: urn:uuid:<uuid>`，report 的 `result` reference 那些 urn:uuid。

`assembleTransactionBundle(assessment, triageResult, intake?)`：
1. `const observations = buildAssessmentObservations(assessment, assessment.childId, triageResult)`（subject 由 server 覆寫，childId 帶現值即可）。
2. 每個 observation 配 `fullUrl = 'urn:uuid:' + crypto.randomUUID()`，包成 entry `{ fullUrl, resource, request: { method: 'POST', url: 'Observation' } }`。
3. `const report = buildTriageDiagnosticReport(assessment, assessment.childId, triageResult, [])`，**覆寫** `report.result = obsEntries.map(e => ({ reference: e.fullUrl }))`（builder 本身不動）。
4. 若有 intake（email 或 phone）→ entry `{ fullUrl, resource: intakeResponse(email, phone), request: { method: 'POST', url: 'QuestionnaireResponse' } }`。
5. entry 順序：intake（若有）→ observations → report。
6. 回 `{ resourceType: 'Bundle', type: 'transaction', entry }`。

> nickname **不**進 QuestionnaireResponse；它走 `/authorize` 的 `nickname` 參數。QR 僅帶 email / phone。

## 6. Callback 分流（/launch/ 同頁兩條路）

`LaunchCallback.svelte` on mount（依序判斷）：
1. `sessionStorage['gcm.flow']` 存在 → **GCM 模式**：狀態機 `loading`，呼叫 `completeGcmUpload()`；成功 → `success`（顯示「已收案 編號 GCM-XXXX」+「查看評估紀錄」鈕回 `/history`）；失敗 → `error`（中文訊息 + 重試）。
2. 否則 `new URLSearchParams(location.search).has('code')` → **fhirclient 補通模式**：`handleCallback()` → `authStore.setAuth(...)` + sessionStorage 交接（§8）→ 導回 `/workspace/`。
3. 否則 → 一般訊息，導回首頁。

## 7. 上傳前要驗證的兩個外部契約細節

實作時對線上實例核對（指引 §6 已給 curl）：
1. **Bundle entry `request` 欄位**：指引內嵌 reference code 的 entry 未帶 `request.method`，但 FHIR transaction 規範要求每 entry 有 `request{method,url}`。本設計**依規範帶上**，並對 GCM repo `scripts/conformance-check.mjs` 的實際 Bundle 形狀核對；若 server 明確要求省略則調整。
2. **intake QuestionnaireResponse linkId**：`intakeResponse()` 採巢狀 `email → email-system/email-value`、`phone → phone-system/phone-value`（指引給的結構）。實作時 `GET /Questionnaire?url=...gcm-intake` 取實際 SDC 定義核對 linkId 命名。

驗證指令：
```bash
curl -s -XPOST https://gcm.fhir.yao.care/register -H 'content-type: application/json' \
  -d '{"redirect_uris":["https://smart-pedi-cds.yao.care/launch/"],"token_endpoint_auth_method":"none"}'
curl -s 'https://gcm.fhir.yao.care/Questionnaire?url=https://gcm.org.tw/fhir/Questionnaire/gcm-intake'
```

## 8. fhirclient 補通（sub-scope，已確認做滿）

既有醫院 standalone 流程未接通，且 `authStore` 是 in-memory `$state`，導航後即失。補通做滿：
- `/launch/` 在 fhirclient 模式：`handleCallback()`（內部 `completeAuth()` → `oauth2.ready()`）取得 `{accessToken, fhirBaseUrl, fhirUser, scopes}`。
- 把上述寫入 `sessionStorage`（key 如 `smartAuth`，序列化），`authStore.setAuth(...)`，導回 `/workspace/`。
- `auth.svelte.ts` 新增 `hydrateFromSession()`：讀 `sessionStorage['smartAuth']` 還原 store。
- `WorkspaceShell.svelte`（及其他需要 auth 的 island）掛載時呼叫 `hydrateFromSession()`，使 token 跨頁可用。
- 範圍界線：僅做 session 內持久化交接；不做 refresh token 自動續期、不做跨 reload 永久保存（session 結束即需重新登入）。

## 9. 錯誤處理

| 情境 | 處理 |
|---|---|
| `/register` 失敗 | throw `register 失敗 <status>`；GCM 模式顯示訊息 + 重試 |
| `state` 不符 | throw `state 不符（CSRF）`；顯示安全錯誤，不重試自動帶入 |
| `?error=` 取代 code（使用者取消） | 顯示「已取消授權」+ 返回 |
| `/token` 失敗 | throw `token 失敗 <status>` + 重試 |
| `assessmentId` 找不到 / 無 triageResult | 顯示「找不到評估資料」，不上傳 |
| `POST /` 上傳失敗 | throw `上傳失敗 <status>`；保留 gcm.flow 供重試 |
| fhirclient `ready()` 失敗 | 顯示登入失敗，導回 workspace 重試 |

## 10. 測試策略

- **單元（vitest）**：
  - PKCE：`b64url` 編碼、`makePkce` 的 challenge = `b64url(SHA256(verifier))` 正確性。
  - `assembleTransactionBundle`：urn:uuid 交叉 reference 正確、report.result 對齊 observation fullUrl、intake QR 條件組裝、entry 帶 `request.method`、無 intake 時不含 QR。
  - `buildAuthorizeUrl`：含 aud、code_challenge_method=S256、login_hint、nickname，不含 openid/fhirUser。
  - `intakeResponse`：email/phone 條件分支。
  - `browserCode()` 持久化（同 session 回同值）。
  - `markGcmSubmitted`（fake-indexeddb：寫入後 `gcmCaseId` / `gcmSubmittedAt` 正確）。
  - `getClientId`（mock fetch：快取命中不重打、未命中打 /register 並快取）。
  - `completeGcmUpload`（mock fetch + fake-indexeddb：token→重建 Bundle→POST，斷言送出的 Bundle 結構）。
- **不單元測**：OAuth redirect 本身（`location.assign`）— 邏輯已抽純函數覆蓋，redirect 是薄殼。
- **線上驗證**（依工作守則直接在 live）：§7 curl + 手動跑一次完整 PKCE→token→transaction，確認回 `GCM-XXXX` 並在 GCM server 查得資源。

## 11. 不要改（紅線）

- 不送 `openid` / `fhirUser` scope。
- 不自組 Patient 當身分。
- `aud` 必為 `https://gcm.fhir.yao.care`。
- 既有醫院 fhirclient 流程的對外行為保留（僅補通 callback，不改 standalone 啟動 UI 語義）。
- `CODE_SYSTEM` 維持不變。
