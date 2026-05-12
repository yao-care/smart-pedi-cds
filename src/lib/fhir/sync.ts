import { upsertPatient } from '../db/patients';
import { addObservations } from '../db/observations';
import type { Patient, Observation } from '../db/schema';
import type { FhirBundle, FhirPatient, FhirObservation } from './resources';

// Minimal stub for FhirClient — replaced by real import once client.ts is available.
interface FhirClient {
  request<T>(url: string, options?: object): Promise<T>;
  getFhirBaseUrl(): string;
}

type PatientMapper = (fhir: FhirPatient) => Patient;
type ObservationMapper = (fhir: FhirObservation) => Observation | null;

export interface SyncManagerOptions {
  intervalMs: number;
  maxBackoffMs?: number;
  patientMapper: PatientMapper;
  observationMapper: ObservationMapper;
  onSyncComplete?: (stats: SyncStats) => void;
  onError?: (error: Error) => void;
  isLeader: () => boolean;
}

export interface SyncStats {
  patientsAdded: number;
  observationsAdded: number;
  timestamp: Date;
}

export class FhirSyncManager {
  private client: FhirClient | null = null;
  private pollingTimer: ReturnType<typeof setInterval> | null = null;
  private options: SyncManagerOptions;
  private currentBackoff: number;
  private consecutiveFailures = 0;
  private _isSyncing = false;
  private _isConnected = false;
  private _lastSyncTime: Date | null = null;

  get isSyncing(): boolean { return this._isSyncing; }
  get isConnected(): boolean { return this._isConnected; }
  get lastSyncTime(): Date | null { return this._lastSyncTime; }

  constructor(options: SyncManagerOptions) {
    this.options = options;
    this.currentBackoff = options.intervalMs;
  }

  /** Set the authorized FHIR client */
  setClient(client: FhirClient): void {
    this.client = client;
    this._isConnected = true;
  }

  /** Start polling at configured interval */
  startPolling(): void {
    this.stopPolling();
    this.currentBackoff = this.options.intervalMs;
    this.consecutiveFailures = 0;
    this.poll(); // immediate first poll
    this.pollingTimer = setInterval(() => this.poll(), this.options.intervalMs);
  }

  /** Stop polling */
  stopPolling(): void {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }
  }

  /** Single poll cycle */
  private async poll(): Promise<void> {
    // Only the leader tab polls
    if (!this.options.isLeader()) return;
    if (!this.client) return;
    if (this._isSyncing) return; // prevent overlapping syncs

    this._isSyncing = true;
    try {
      const stats = await this.syncAll();
      this.consecutiveFailures = 0;
      this.currentBackoff = this.options.intervalMs;
      this._lastSyncTime = new Date();
      this.options.onSyncComplete?.(stats);
    } catch (error) {
      this.consecutiveFailures++;
      this._isConnected = false;
      // Exponential backoff: double on each failure, capped at maxBackoffMs
      const maxBackoff = this.options.maxBackoffMs ?? 60_000;
      this.currentBackoff = Math.min(
        this.options.intervalMs * Math.pow(2, this.consecutiveFailures),
        maxBackoff,
      );
      this.options.onError?.(error instanceof Error ? error : new Error(String(error)));

      // Restart polling with the new backoff interval
      this.stopPolling();
      this.pollingTimer = setInterval(() => this.poll(), this.currentBackoff);
    } finally {
      this._isSyncing = false;
    }
  }

  /** Sync all data from the FHIR server */
  private async syncAll(): Promise<SyncStats> {
    if (!this.client) throw new Error('No FHIR client');

    let patientsAdded = 0;
    let observationsAdded = 0;

    // Fetch patient bundle
    const patientBundle = await this.client.request<FhirBundle<FhirPatient>>(
      'Patient?_count=100',
    );
    const patients = patientBundle.entry?.map(e => e.resource) ?? [];

    for (const fhirPatient of patients) {
      const local = this.options.patientMapper(fhirPatient);
      await upsertPatient(local);
      patientsAdded++;
    }

    // Fetch observations for each patient
    for (const fhirPatient of patients) {
      const obsBundle = await this.client.request<FhirBundle<FhirObservation>>(
        `Observation?patient=${fhirPatient.id}&_sort=-date&_count=50`,
      );
      const observations = (obsBundle.entry?.map(e => e.resource) ?? [])
        .map(obs => this.options.observationMapper(obs))
        .filter((obs): obs is Observation => obs !== null);

      if (observations.length > 0) {
        await addObservations(observations);
        observationsAdded += observations.length;
      }
    }

    this._isConnected = true;
    return { patientsAdded, observationsAdded, timestamp: new Date() };
  }

  /** Disconnect and clean up */
  disconnect(): void {
    this.stopPolling();
    this.client = null;
    this._isConnected = false;
  }
}
