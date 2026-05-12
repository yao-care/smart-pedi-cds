# P2: SMART on FHIR Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Implement complete SMART on FHIR connectivity — OAuth 2.0 + PKCE authorization, data fetching, token refresh, connection management, and FHIR resource write-back.

**Architecture:** fhirclient.js for SMART launch + OAuth, custom sync layer for polling/subscription, Dexie.js for caching, Svelte 5 runes for reactive state.

**Tech Stack:** fhirclient.js, OAuth 2.0 + PKCE, FHIR R4, Dexie.js 4.x, Svelte 5

---

### Task P2-1: FHIR Client Wrapper

**Files:**
- Create: `src/lib/fhir/client.ts`
- Create: `src/lib/fhir/resources.ts`

**client.ts:** Wrap fhirclient.js with typed helpers:
- `initStandalone(fhirBaseUrl: string, clientId: string, scopes: string): Promise<void>` — standalone launch
- `initEhrLaunch(): Promise<void>` — EHR launch (reads URL params)
- `getClient(): fhirclient.Client` — current authorized client
- `isAuthorized(): boolean`
- `getAccessToken(): string`
- `getFhirUser(): string`
- `getScopes(): string[]`
- `refreshToken(): Promise<void>`

**resources.ts:** TypeScript types for FHIR R4 resources used:
- `FhirPatient`, `FhirObservation`, `FhirRiskAssessment`, `FhirBundle`
- Mapping functions: `fhirPatientToLocal(fhir: FhirPatient): Patient`
- `fhirObservationToLocal(fhir: FhirObservation): Observation`
- `localAlertToFhirRiskAssessment(alert: Alert): FhirRiskAssessment`

---

### Task P2-2: SMART Launch Flows

**Files:**
- Create: `src/lib/fhir/launch.ts`

**launch.ts:** Handle both launch modes:
- `handleStandaloneLaunch(fhirBaseUrl: string, clientId: string, scopes: string): Promise<void>` — discover .well-known, redirect to authorize
- `handleEhrLaunch(): Promise<void>` — read `launch` + `iss` params, authorize
- `handleCallback(): Promise<fhirclient.Client>` — process OAuth callback
- `discoverSmartConfig(fhirBaseUrl: string): Promise<SmartConfiguration>` — fetch .well-known/smart-configuration

---

### Task P2-3: Data Sync Strategy

**Files:**
- Create: `src/lib/fhir/sync.ts`

**sync.ts:** Polling + optional WebSocket subscription:
- `FhirSyncManager` class:
  - `startPolling(client: fhirclient.Client, intervalMs: number): void`
  - `stopPolling(): void`
  - `fetchPatients(): Promise<void>` — GET /Patient, cache to IndexedDB
  - `fetchObservations(patientId: string): Promise<void>` — GET /Observation?patient=xxx&_sort=-date
  - `tryWebSocket(client: fhirclient.Client): Promise<boolean>` — attempt $get-ws-binding-token, return success
  - Exponential backoff on failure (1s → 2s → 4s → ... → 60s max)
  - Token auto-refresh before expiry
- Only leader tab polls (check `tabCoordinator.isLeader`)

---

### Task P2-4: FHIR Write-back

**Files:**
- Create: `src/engine/fhir-writer.ts`

**fhir-writer.ts:**
- `writeRiskAssessment(alert: Alert): Promise<string>` — POST /RiskAssessment, return FHIR ID
- `processSyncQueue(): Promise<void>` — drain sync queue, retry failed items
- Offline-aware: if no connection, enqueue to sync-queue
- Only execute if auth scopes include write permission

---

### Task P2-5: FHIR UI Components

**Files:**
- Create: `src/components/fhir/LaunchSelector.svelte`
- Create: `src/components/fhir/StandaloneLaunch.svelte`
- Create: `src/components/fhir/ConnectionStatus.svelte`
- Create: `src/components/fhir/ServerConfig.svelte`

Svelte 5 components using runes for FHIR connection UI.
