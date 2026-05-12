import { getClient, isAuthorized } from './client';
import { buildAssessmentObservations, buildTriageDiagnosticReport } from './cdsa-resources';
import { markFhirSubmitted } from '../db/assessments';
import type { Assessment } from '../db/schema';
import type { TriageResult } from '../../engine/cdsa/triage';

export interface SubmitResult {
  success: boolean;
  observationIds: string[];
  diagnosticReportId: string | null;
  error?: string;
}

/**
 * Submit CDSA assessment results to the FHIR server.
 * Creates Observation resources for each metric + a DiagnosticReport.
 */
export async function submitAssessmentToFhir(
  assessment: Assessment,
  childId: string,
  triageResult: TriageResult,
): Promise<SubmitResult> {
  if (!isAuthorized()) {
    return { success: false, observationIds: [], diagnosticReportId: null, error: '未連線 FHIR Server' };
  }

  const client = getClient();
  const observationIds: string[] = [];

  try {
    // 1. Create Observations for each metric
    const observations = buildAssessmentObservations(assessment, childId, triageResult);

    for (const obs of observations) {
      const result = await client.request<{ id: string }>('Observation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/fhir+json' },
        body: JSON.stringify(obs),
      });

      if (result?.id) {
        observationIds.push(result.id);
      }
    }

    // 2. Create DiagnosticReport referencing the Observations
    const report = buildTriageDiagnosticReport(assessment, childId, triageResult, observationIds);

    const reportResult = await client.request<{ id: string }>('DiagnosticReport', {
      method: 'POST',
      headers: { 'Content-Type': 'application/fhir+json' },
      body: JSON.stringify(report),
    });

    const diagnosticReportId = reportResult?.id ?? null;

    // 3. Mark assessment as submitted
    await markFhirSubmitted(assessment.id);

    return { success: true, observationIds, diagnosticReportId };
  } catch (err) {
    return {
      success: false,
      observationIds,
      diagnosticReportId: null,
      error: err instanceof Error ? err.message : '傳送失敗，請稍後重試',
    };
  }
}
