import Dexie, { type Table } from 'dexie';
import type { RiskLevel } from '../utils/risk-levels';
import { recomputeTriageResult, type PersistedTriageResult } from '../baselines/recompute-triage';
import { ageGroupCDSAAt } from '../utils/age-groups';

export type { RiskLevel };
export type AlertStatus = 'open' | 'acknowledged' | 'false_positive' | 'resolved';

export interface Patient {
  id: string;              // FHIR Patient ID
  name?: string;
  birthDate: string;
  gender: 'male' | 'female';
  ageGroup: 'infant' | 'toddler' | 'preschool';
  currentRiskLevel: RiskLevel;
  lastSyncedAt: Date;
}

export interface Observation {
  id: string;              // FHIR Observation ID
  patientId: string;
  indicator: string;       // LOINC code
  value: number;
  unit: string;
  effectiveDateTime: Date;
  syncedAt: Date;
}

export interface Alert {
  id: string;              // local UUID
  patientId: string;
  riskLevel: RiskLevel;
  status: AlertStatus;
  indicators: string[];    // triggered indicators
  rationale: string;
  ruleVersion: string;
  modelVersion?: string;
  inputSnapshot: object;   // complete decision trace
  fhirRiskAssessmentId?: string;
  educationRecommended?: string[];
  educationTriggeredAt?: Date;
  acknowledgedBy?: string;
  notes?: string;
  parentAlertId?: string;
  createdAt: Date;
  closedAt?: Date;
}

export interface Baseline {
  patientId: string;
  indicator: string;
  mean: number;
  std: number;
  sampleCount: number;
  updatedAt: Date;
}

export interface SyncQueueItem {
  id: string;
  action: 'create' | 'update';
  resourceType: string;
  payload: object;
  createdAt: Date;
  retryCount: number;
}

export interface ServerConfig {
  id: string;
  name: string;
  fhirBaseUrl: string;
  clientId: string;
  scopes: string;
  lastUsedAt: Date;
}

export interface EducationInteraction {
  id: string;
  contentSlug: string;
  action: 'view' | 'complete' | 'questionnaire_submit';
  durationSeconds?: number;
  questionnaireAnswers?: object;
  createdAt: Date;
}

export interface RuleVersion {
  id: string;
  yamlContent: string;
  changedBy: string;
  changeReason: string;
  createdAt: Date;
}

export interface WebhookHistoryEntry {
  id: string;
  webhookId: string;
  alertId: string;
  url: string;
  status: 'success' | 'failed';
  statusCode?: number;
  createdAt: Date;
}

export type AssessmentStatus = 'started' | 'paused' | 'resumed' | 'completed' | 'incomplete';

export type AgeGroupCDSA = '2-6m' | '7-12m' | '13-24m' | '25-36m' | '37-48m' | '49-60m' | '61-72m';

export interface Child {
  id: string;
  birthDate: string;
  gender: 'male' | 'female' | 'other';
  nickName?: string;
  createdAt: Date;
}

export interface Assessment {
  id: string;
  childId: string;
  status: AssessmentStatus;
  language: string;
  currentStep: number;
  startedAt: Date;
  completedAt?: Date;
  pausedAt?: Date;
  triageResult?: {
    category: 'normal' | 'monitor' | 'refer';
    confidence: number;
    summary: string;
    /** Optional full per-metric breakdown. Populated by the parent flow so
     *  the standalone /result/?id= page can render the radar without
     *  recomputing triage. Older records (saved before this field was
     *  added) won't have it; UI should fall back to a summary-only view. */
    details?: Array<{
      domain: string;
      metric: string;
      value: number;
      zScore: number | null;
      directionalZ: number | null;
      normMean?: number | null;
      normStd?: number | null;
      maxScore?: number | null;
      isAnomaly: boolean;
    }>;
    anomalyCount?: number;
  };
  fhirSubmitted: boolean;
  fhirDiagnosticReportId?: string;
  physicianNote?: string | null;
  physicianNoteUpdatedAt?: Date | null;
  /** Origin of the record. Undefined / 'idb' = produced on this device.
   *  'fhir-cache' = pulled from FHIR server by the cross-device resolver and cached locally. */
  _source?: 'idb' | 'fhir-cache';
  /** v5: when true, run all modules regardless of questionnaire score; default false. */
  forceFullAssessment?: boolean;
  /** v6: marker for retroactive triage recomputation status (spec §7.3 / §13.5).
   *  Values: 'v6-recomputed' = triageResult refreshed under per-domain z + ASQ-3
   *  norms; 'v6-no-details' = no details to recompute (legacy stub);
   *  'v6-skip-no-completedAt' / 'v6-skip-no-birthDate' = couldn't derive ageGroup
   *  so the old triageResult was kept as-is. Absent = pre-v6 record never opened
   *  after the upgrade (shouldn't happen in practice since the version bump
   *  forces the upgrade tx on first open). */
  schemaVersion?: 'v6-recomputed' | 'v6-no-details' | 'v6-skip-no-completedAt' | 'v6-skip-no-birthDate';
  createdAt: Date;
  updatedAt: Date;
}

export interface AssessmentEvent {
  id: string;
  assessmentId: string;
  childId: string;
  moduleType: 'questionnaire' | 'game' | 'voice' | 'video' | 'drawing';
  eventType: string;
  timestamp: Date;
  data: Record<string, unknown>;
  qualityFlags?: {
    isComplete: boolean;
    isAnomaly: boolean;
    anomalyType?: string;
  };
}

export interface MediaFile {
  id: string;
  assessmentId: string;
  childId: string;
  fileType: 'voice' | 'video' | 'drawing';
  blob: Blob;
  mimeType: string;
  fileSize: number;
  duration?: number;
  processed: boolean;
  createdAt: Date;
}

export interface NormThreshold {
  id: string;
  ageGroup: AgeGroupCDSA;
  metric: string;
  mean: number;
  std: number;
  source: string;
  updatedAt: Date;
}

export interface CustomEducation {
  id: string;
  tenantId: string;         // derived from FHIR base URL
  title: string;
  summary: string;
  category: string;
  ageGroup: string[];       // ['infant', 'toddler', 'preschool']
  format: 'article' | 'video';
  content: string;          // Markdown content for articles
  videoUrl?: string;        // YouTube URL for videos
  triggerIndicators: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface TenantSettings {
  id: string;               // tenantId
  tenantId: string;
  displayName: string;
  pollingInterval: number;
  advisoryBatchInterval: number;
  browserNotifications: boolean;
  soundEnabled: boolean;
  alertAfterHours: number;
  customRulesYaml?: string;  // tenant-specific YAML rules override
  updatedAt: Date;
}

/** Triage category × domain recommendation overlay (one row per cell). */
export type RecommendationCategory = 'normal' | 'monitor' | 'refer';
export type RecommendationSource = 'internal' | 'custom' | 'external';

export interface RecommendationItem {
  source: RecommendationSource;
  /** For source: 'internal' — slug under /education/{slug}/ */
  slug?: string;
  /** For source: 'custom' — id of a CustomEducation row */
  customId?: string;
  /** For source: 'external' — full URL (e.g. YouTube, hospital page) */
  url?: string;
  /** Display title; required for external, optional for internal/custom (falls back to source content) */
  title?: string;
  /** Display summary (one-liner) */
  summary?: string;
}

export interface RecommendationOverlay {
  /** Composite id: `${tenantId}::${category}::${domain}` */
  id: string;
  tenantId: string;
  category: RecommendationCategory;
  domain: string;
  items: RecommendationItem[];
  /** When true, items are appended to the default list; when false, items replace the default. */
  mergeWithDefault: boolean;
  updatedAt: Date;
}

export class CdssDatabase extends Dexie {
  patients!: Table<Patient>;
  observations!: Table<Observation>;
  alerts!: Table<Alert>;
  baselines!: Table<Baseline>;
  syncQueue!: Table<SyncQueueItem>;
  serverConfigs!: Table<ServerConfig>;
  educationInteractions!: Table<EducationInteraction>;
  ruleVersions!: Table<RuleVersion>;
  webhookHistory!: Table<WebhookHistoryEntry>;
  children!: Table<Child>;
  assessments!: Table<Assessment>;
  assessmentEvents!: Table<AssessmentEvent>;
  mediaFiles!: Table<MediaFile>;
  normThresholds!: Table<NormThreshold>;
  customEducation!: Table<CustomEducation>;
  tenantSettings!: Table<TenantSettings>;
  recommendationOverlays!: Table<RecommendationOverlay>;

  constructor() {
    super('cdss-pediatric');
    this.version(1).stores({
      patients: 'id, ageGroup, currentRiskLevel, lastSyncedAt',
      observations: 'id, patientId, indicator, effectiveDateTime, [patientId+indicator]',
      alerts: 'id, patientId, riskLevel, status, createdAt, [patientId+status]',
      baselines: '[patientId+indicator], patientId, updatedAt',
      syncQueue: 'id, createdAt',
      serverConfigs: 'id, lastUsedAt',
      educationInteractions: 'id, contentSlug, createdAt',
      ruleVersions: 'id, createdAt',
      webhookHistory: 'id, webhookId, alertId, createdAt',
    });
    this.version(2).stores({
      // Repeat ALL v1 stores exactly as they are
      patients: 'id, ageGroup, currentRiskLevel, lastSyncedAt',
      observations: 'id, patientId, indicator, effectiveDateTime, [patientId+indicator]',
      alerts: 'id, patientId, riskLevel, status, createdAt, [patientId+status]',
      baselines: '[patientId+indicator], patientId, updatedAt',
      syncQueue: 'id, createdAt',
      serverConfigs: 'id, lastUsedAt',
      educationInteractions: 'id, contentSlug, createdAt',
      ruleVersions: 'id, createdAt',
      webhookHistory: 'id, webhookId, alertId, createdAt',
      // New v2 stores
      children: 'id, createdAt',
      assessments: 'id, childId, status, createdAt, [childId+status]',
      assessmentEvents: 'id, assessmentId, childId, moduleType, timestamp, [assessmentId+moduleType]',
      mediaFiles: 'id, assessmentId, childId, fileType, createdAt, [assessmentId+fileType]',
      normThresholds: 'id, ageGroup, metric, [ageGroup+metric]',
    });
    this.version(3).stores({
      // Repeat ALL v2 stores exactly as they are
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
      // New v3 stores
      customEducation: 'id, tenantId, category, isActive, [tenantId+isActive]',
      tenantSettings: 'id, tenantId',
    });
    this.version(4).stores({
      // Repeat ALL v3 stores exactly as they are
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
      // New v4 store
      recommendationOverlays: 'id, tenantId, category, domain, [tenantId+category+domain]',
    });
    this.version(5).stores({
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
    }).upgrade(async tx => {
      await tx.table('assessments').toCollection().modify(a => {
        a.forceFullAssessment = false;
      });
    });
    // v6: retroactive triage recompute (spec §7.3 / §13.5).
    //
    // Phase 2 changed live triage to per-domain z + ASQ-3 borrow. v5 records
    // still hold the old questionnaire-as-rawScore triage result and would
    // render the "雷達 50 卻判 monitor" mismatch (§1) when re-opened.
    //
    // No store-shape change here — `.stores({...})` repeats v5 exactly. The
    // upgrade tx walks every assessment, derives the assessment-time ageGroup
    // from the child's birthDate + assessment.completedAt, and calls
    // recomputeTriageResult to refresh details + domainLevelZ + category
    // under the new gating. schemaVersion field marks the outcome so the UI
    // can detect legacy records that couldn't be recomputed.
    this.version(6).stores({
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
    }).upgrade(async tx => {
      // Pre-load children into a Map so the modify() loop avoids N+1 reads.
      // children table is small (1 row per child evaluated on this device).
      const childRows = await tx.table('children').toArray() as Array<{ id: string; birthDate?: string }>;
      const birthDateByChild = new Map<string, string>();
      for (const c of childRows) {
        if (c.id && c.birthDate) birthDateByChild.set(c.id, c.birthDate);
      }

      await tx.table('assessments').toCollection().modify((a: {
        childId?: string;
        completedAt?: Date | string;
        triageResult?: PersistedTriageResult;
        schemaVersion?: string;
      }) => {
        if (!a.triageResult || !a.triageResult.details || a.triageResult.details.length === 0) {
          a.schemaVersion = 'v6-no-details';
          return;
        }
        if (!a.completedAt) {
          a.schemaVersion = 'v6-skip-no-completedAt';
          return;
        }
        const birthDate = a.childId ? birthDateByChild.get(a.childId) : undefined;
        if (!birthDate || Number.isNaN(new Date(birthDate).getTime())) {
          a.schemaVersion = 'v6-skip-no-birthDate';
          return;
        }
        const completedAtDate = a.completedAt instanceof Date ? a.completedAt : new Date(a.completedAt);
        if (Number.isNaN(completedAtDate.getTime())) {
          a.schemaVersion = 'v6-skip-no-completedAt';
          return;
        }
        const ageGroup = ageGroupCDSAAt(birthDate, completedAtDate);
        a.triageResult = recomputeTriageResult(a.triageResult, ageGroup);
        a.schemaVersion = 'v6-recomputed';
      });
    });
  }
}

export const db = new CdssDatabase();
