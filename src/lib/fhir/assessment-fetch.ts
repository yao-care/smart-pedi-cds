import type { Assessment } from '../db/schema';
import { CODE_SYSTEM, ID_SYSTEM, CONFIDENCE_EXT_URL } from './cdsa-resources';

export interface AssessmentSummary {
  id: string;
  fhirReportId: string;
  /** FHIR Patient reference (e.g. "Patient/abc123"). Useful for the
   *  cross-patient workspace list to show which subject each row is for. */
  patientRef: string;
  date: Date;
  category: 'normal' | 'monitor' | 'refer';
  summary: string;
}

interface FhirClient {
  request(query: string): Promise<unknown>;
}

/** Lightweight Bundle entry shape we rely on. */
interface BundleEntry {
  resource: Record<string, unknown>;
}

interface Bundle {
  entry?: BundleEntry[];
}

/** 任一 FHIR 資源；本模組不讀 Observation 的欄位，故不細部建模。 */
type FhirResourceLike = Record<string, unknown>;

/**
 * DiagnosticReport **本模組實際會讀到的欄位**，非完整 FHIR 型別建模。
 * 刻意不用 `Record<string, any>`：專案規則禁 `any`，而全欄位建模對這裡的
 * 用途（擷取少數欄位還原 Assessment）過重且易與伺服器實際回傳脫節。
 */
interface FhirDiagnosticReportLike {
  id?: string;
  status?: string;
  identifier?: Array<{ system?: string; value?: string }>;
  conclusion?: string;
  conclusionCode?: Array<{ coding?: Array<{ code?: string }> }>;
  extension?: Array<{ url?: string; valueDecimal?: number }>;
  effectivePeriod?: { start?: string; end?: string };
  effectiveDateTime?: string;
  subject?: { reference?: string };
}

/**
 * Map SNOMED conclusionCode → triage category. Falls back to 'monitor'
 * when the code is unrecognised so reverse-mapped reports stay usable.
 */
function snomedToCategory(code: string | undefined): 'normal' | 'monitor' | 'refer' {
  switch (code) {
    case '17621005': return 'normal';
    case '394848005': return 'monitor';
    case '3457005': return 'refer';
    default: return 'monitor';
  }
}

/** Strip backward-compat conclusion prefix「<分類>（信心度 X%）。 」if present. */
function stripLegacyConclusionPrefix(conclusion: string): string {
  return conclusion.replace(/^.+?（信心度\s*\d+%）。\s*/, '');
}

/**
 * Parse Observation.code.text "CDSA gross_motor::reactionLatency" (new format)
 * or "CDSA gross_motor: reactionLatency" (legacy). Returns null on miss.
 */
export function parseObservationCode(text: string): { domain: string; metric: string } | null {
  const m = text.match(/^CDSA\s+(\w+)(?:::|:\s+)(\w+)$/);
  return m ? { domain: m[1], metric: m[2] } : null;
}

/**
 * Reconstruct a local-shape Assessment from a FHIR DiagnosticReport plus
 * its Observation resources. Used by the physician detail view when the
 * record is not in IndexedDB.
 */
export function bundleToAssessment(
  report: FhirDiagnosticReportLike,
  _observations: FhirResourceLike[],
): Assessment {
  const identifiers = report.identifier ?? [];
  const idVal = identifiers.find((i) => i.system === ID_SYSTEM)?.value ?? report.id ?? '';

  const conclusionCode = report.conclusionCode?.[0]?.coding?.[0]?.code;
  const category = snomedToCategory(conclusionCode);

  const extensions = report.extension ?? [];
  const confidence = extensions.find((x) => x.url === CONFIDENCE_EXT_URL)?.valueDecimal ?? 0;

  const period = report.effectivePeriod;
  const startedAtStr = period?.start ?? report.effectiveDateTime;
  const startedAt = startedAtStr ? new Date(startedAtStr) : new Date(0);
  const completedAt = period?.end ? new Date(period.end) : undefined;

  const conclusion = report.conclusion ?? '';
  const summary = stripLegacyConclusionPrefix(conclusion);

  const subjectRef = report.subject?.reference ?? '';
  const childId = subjectRef.replace(/^Patient\//, '');

  return {
    id: idVal,
    childId,
    status: report.status === 'final' ? 'completed' : 'in_progress',
    language: 'zh-TW',
    currentStep: 7,
    startedAt,
    completedAt,
    triageResult: {
      category,
      confidence,
      summary,
    },
    fhirSubmitted: true,
    fhirDiagnosticReportId: report.id ?? '',
    createdAt: startedAt,
    updatedAt: completedAt ?? startedAt,
  } as Assessment;
}

/**
 * Look up one assessment on the FHIR server by its CDSA UUID.
 * Uses _include to fetch the referenced Observations in a single request.
 */
export async function fetchAssessmentFromFhir(
  id: string,
  client: FhirClient,
): Promise<Assessment | null> {
  const bundle = (await client.request(
    `DiagnosticReport?identifier=${ID_SYSTEM}|${id}&_include=DiagnosticReport:result`,
  )) as Bundle;
  const entries = bundle.entry ?? [];
  const reportEntry = entries.find((e) => e.resource.resourceType === 'DiagnosticReport');
  if (!reportEntry) return null;
  const observations = entries
    .filter((e) => e.resource.resourceType === 'Observation')
    .map((e) => e.resource as FhirResourceLike);
  return bundleToAssessment(reportEntry.resource as FhirDiagnosticReportLike, observations);
}

/**
 * List CDSA assessments on the FHIR server.
 * - With `patientId`: scoped to that patient (per-patient history view).
 * - Without `patientId`: every CDSA report the user can read (workspace
 *   roster view, grouped by triage category).
 * Returns a summary row per DiagnosticReport — full metric values are
 * not loaded here; the detail page calls resolveAssessment(id) on click.
 */
export async function listAssessmentsFromFhir(
  patientId: string | undefined,
  client: FhirClient,
): Promise<AssessmentSummary[]> {
  const subjectClause = patientId ? `subject=Patient/${patientId}&` : '';
  const bundle = (await client.request(
    `DiagnosticReport?${subjectClause}` +
      `code=${CODE_SYSTEM}|cdsa-assessment` +
      `&_sort=-date`,
  )) as Bundle;
  return (bundle.entry ?? []).map((e) => {
    const r = e.resource as FhirDiagnosticReportLike;
    const identifiers = r.identifier ?? [];
    const idVal = identifiers.find((i) => i.system === ID_SYSTEM)?.value ?? r.id ?? '';
    const dateStr = r.effectivePeriod?.start ?? r.effectiveDateTime;
    const conclusionCode = r.conclusionCode?.[0]?.coding?.[0]?.code;
    const patientRef = r.subject?.reference ?? '';
    return {
      id: idVal,
      fhirReportId: r.id ?? '',
      patientRef,
      date: new Date(dateStr ?? 0),
      category: snomedToCategory(conclusionCode),
      summary: stripLegacyConclusionPrefix(r.conclusion ?? ''),
    };
  });
}
