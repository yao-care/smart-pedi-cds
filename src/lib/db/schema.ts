import Dexie, { type Table } from 'dexie';

export type RiskLevel = 'normal' | 'advisory' | 'warning' | 'critical';
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
  }
}

export const db = new CdssDatabase();
