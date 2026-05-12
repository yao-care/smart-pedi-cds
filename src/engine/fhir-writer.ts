import type { Alert } from '../lib/db/schema';
import { enqueue } from '../lib/db/sync-queue';
import type { FhirRiskAssessment } from '../lib/fhir/resources';

// Minimal stub for FhirClient — replaced by real import once client.ts is available.
interface FhirClient {
  request<T>(url: string, options?: object): Promise<T>;
}

type AlertToFhirMapper = (alert: Alert, patientId: string) => FhirRiskAssessment;

export interface FhirWriterOptions {
  getClient: () => FhirClient | null;
  isAuthorized: () => boolean;
  canWrite: () => boolean;
  alertToFhir: AlertToFhirMapper;
}

export class FhirWriter {
  private options: FhirWriterOptions;

  constructor(options: FhirWriterOptions) {
    this.options = options;
  }

  /**
   * Write a RiskAssessment to the FHIR server.
   * If offline or unauthorized, enqueues the write for later sync.
   * Returns the FHIR resource ID if the write succeeded, null if queued.
   */
  async writeRiskAssessment(alert: Alert): Promise<string | null> {
    if (!this.options.canWrite()) {
      return null; // no write permission
    }

    const fhirResource = this.options.alertToFhir(alert, alert.patientId);

    const client = this.options.getClient();
    if (!client || !this.options.isAuthorized()) {
      // Offline — enqueue for later
      await enqueue({
        action: 'create',
        resourceType: 'RiskAssessment',
        payload: fhirResource,
      });
      return null;
    }

    try {
      const result = await client.request<{ id: string }>('RiskAssessment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/fhir+json' },
        body: JSON.stringify(fhirResource),
      });
      return result.id;
    } catch {
      // Write failed — enqueue for retry
      await enqueue({
        action: 'create',
        resourceType: 'RiskAssessment',
        payload: fhirResource,
      });
      return null;
    }
  }

  /**
   * Drain the sync queue, sending pending writes to the FHIR server.
   * Returns the number of items successfully processed.
   */
  async processSyncQueue(): Promise<number> {
    const { dequeue, markComplete, incrementRetry } = await import('../lib/db/sync-queue');

    const client = this.options.getClient();
    if (!client || !this.options.isAuthorized() || !this.options.canWrite()) {
      return 0;
    }

    const items = await dequeue(10);
    let processed = 0;

    for (const item of items) {
      try {
        await client.request(item.resourceType, {
          method: item.action === 'create' ? 'POST' : 'PUT',
          headers: { 'Content-Type': 'application/fhir+json' },
          body: JSON.stringify(item.payload),
        });
        await markComplete(item.id);
        processed++;
      } catch {
        await incrementRetry(item.id);
      }
    }

    return processed;
  }
}
