# P1: Data Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Build the IndexedDB DAO layer, data sync infrastructure, multi-tab coordination, and Svelte 5 runes stores — providing the reactive data foundation for all subsequent phases.

**Architecture:** Dexie.js 4.x with liveQuery for reactive IndexedDB access, BroadcastChannel API for multi-tab leader election, Svelte 5 runes ($state/$derived) for UI-reactive stores.

**Tech Stack:** Dexie.js 4.x, BroadcastChannel API, Svelte 5 runes, TypeScript

---

## Dependency Graph

```
P1-1 (DAOs) ──┬── P1-3 (Svelte stores)
              │
P1-2 (tab coordinator) ──┘
```

Wave 1 (parallel): P1-1, P1-2
Wave 2 (needs both): P1-3

---

### Task P1-1: Database Access Objects (DAOs)

**Files:**
- Create: `src/lib/db/patients.ts`
- Create: `src/lib/db/observations.ts`
- Create: `src/lib/db/alerts.ts`
- Create: `src/lib/db/sync-queue.ts`

**Requirements:**

Each DAO provides typed CRUD operations over Dexie.js tables.

**patients.ts:**
- `getAllPatients(): Promise<Patient[]>` — sorted by riskLevel desc, then name
- `getPatient(id: string): Promise<Patient | undefined>`
- `upsertPatient(patient: Patient): Promise<void>` — insert or update
- `updateRiskLevel(id: string, level: RiskLevel): Promise<void>`
- `getPatientsByRiskLevel(level: RiskLevel): Promise<Patient[]>`
- `getRiskSummary(): Promise<Record<RiskLevel, number>>` — count per level
- `deleteOldPatients(olderThan: Date): Promise<number>` — cleanup

**observations.ts:**
- `addObservations(obs: Observation[]): Promise<void>` — bulk insert
- `getLatestObservations(patientId: string): Promise<Record<string, Observation>>` — latest per indicator
- `getObservationHistory(patientId: string, indicator: string, since: Date): Promise<Observation[]>` — time-sorted
- `getObservationCount(patientId: string, indicator: string): Promise<number>`
- `deleteOldObservations(olderThan: Date): Promise<number>` — cleanup >90 days

**alerts.ts:**
- `createAlert(alert: Alert): Promise<string>` — returns ID
- `getOpenAlerts(patientId?: string): Promise<Alert[]>` — open alerts, optional patient filter
- `getAlertsByStatus(status: AlertStatus, limit?: number): Promise<Alert[]>`
- `updateAlertStatus(id: string, status: AlertStatus, notes?: string, acknowledgedBy?: string): Promise<void>`
- `getAlertHistory(patientId: string, since: Date): Promise<Alert[]>`
- `findDuplicateAlert(patientId: string, indicators: string[], windowMinutes: number): Promise<Alert | undefined>` — dedup check
- `getAlertChain(alertId: string): Promise<Alert[]>` — follow parentAlertId chain
- `batchUpdateStatus(ids: string[], status: AlertStatus): Promise<void>`

**sync-queue.ts:**
- `enqueue(item: Omit<SyncQueueItem, 'id' | 'createdAt' | 'retryCount'>): Promise<string>`
- `dequeue(limit?: number): Promise<SyncQueueItem[]>` — oldest first
- `markComplete(id: string): Promise<void>` — delete from queue
- `incrementRetry(id: string): Promise<void>`
- `getQueueSize(): Promise<number>`
- `clearOldItems(maxRetries: number): Promise<number>` — remove items exceeding retry limit

All DAOs import `db` from `./schema.ts` and use Dexie transactions where appropriate.

---

### Task P1-2: Multi-Tab Coordinator

**Files:**
- Create: `src/engine/tab-coordinator.ts`

**Requirements:**

BroadcastChannel-based leader election for multi-tab coordination.

- Channel name: `cdss-tab-coordinator`
- Messages: `{ type: 'heartbeat' | 'elect' | 'leader' | 'resign', tabId: string, timestamp: number }`
- `TabCoordinator` class:
  - `tabId`: random UUID generated on construction
  - `isLeader: boolean` — reactive (for Svelte)
  - `start()`: begin leader election, start heartbeat
  - `stop()`: resign leadership, close channel
  - `onLeaderChange(callback: (isLeader: boolean) => void)`: register listener
- Leader election algorithm:
  1. On start, broadcast `elect` message
  2. Wait 1 second for responses
  3. If no `leader` message received, claim leadership
  4. Leader broadcasts `heartbeat` every 5 seconds
  5. Followers check: if no heartbeat for 10 seconds, initiate new election
  6. On `beforeunload`, leader broadcasts `resign`
- Export singleton `tabCoordinator`

---

### Task P1-3: Svelte 5 Runes Stores

**Files:**
- Create: `src/lib/stores/auth.svelte.ts`
- Create: `src/lib/stores/patients.svelte.ts`
- Create: `src/lib/stores/alerts.svelte.ts`
- Create: `src/lib/stores/settings.svelte.ts`

**Requirements:**

All stores use Svelte 5 runes (`$state`, `$derived`, `$effect`). NOT Svelte 4 stores.

**auth.svelte.ts:**
```typescript
class AuthStore {
  accessToken = $state<string | null>(null);
  fhirBaseUrl = $state<string | null>(null);
  fhirUser = $state<string | null>(null);
  scopes = $state<string[]>([]);
  isAuthenticated = $derived(this.accessToken !== null);
  canWrite = $derived(this.scopes.some(s => s.includes('.write') || s.includes('/*.')));
  canReadPatients = $derived(this.scopes.some(s => s.includes('Patient.read') || s.includes('/*.read')));

  setAuth(token: string, baseUrl: string, user: string, scopes: string[]) { ... }
  clearAuth() { ... }
}
export const authStore = new AuthStore();
```

**patients.svelte.ts:**
```typescript
class PatientStore {
  patients = $state<Patient[]>([]);
  selectedPatientId = $state<string | null>(null);
  selectedPatient = $derived(this.patients.find(p => p.id === this.selectedPatientId));
  riskSummary = $derived(/* count per risk level */);
  isLoading = $state(false);

  async loadPatients() { ... } // from DAO
  selectPatient(id: string) { ... }
}
export const patientStore = new PatientStore();
```

**alerts.svelte.ts:**
```typescript
class AlertStore {
  alerts = $state<Alert[]>([]);
  filterLevel = $state<RiskLevel | 'all'>('all');
  filterStatus = $state<AlertStatus | 'all'>('all');
  filteredAlerts = $derived(/* apply filters */);
  openCount = $derived(this.alerts.filter(a => a.status === 'open').length);
  criticalCount = $derived(this.alerts.filter(a => a.riskLevel === 'critical' && a.status === 'open').length);

  async loadAlerts() { ... }
  async acknowledgeAlert(id: string, notes?: string) { ... }
  async markFalsePositive(id: string, notes?: string) { ... }
  async batchAcknowledge(ids: string[]) { ... }
}
export const alertStore = new AlertStore();
```

**settings.svelte.ts:**
```typescript
class SettingsStore {
  pollingInterval = $state(30); // seconds
  advisoryBatchInterval = $state(5); // minutes
  browserNotifications = $state(true);
  soundEnabled = $state(true);
  alertAfterHours = $state(24);

  async load() { ... } // from IndexedDB
  async save() { ... } // to IndexedDB
}
export const settingsStore = new SettingsStore();
```

All stores import from DAOs and use Dexie liveQuery where appropriate for reactive updates.
