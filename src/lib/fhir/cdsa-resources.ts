import type { TriageResult } from '../../engine/cdsa/triage';
import type { Assessment, Child } from '../db/schema';

/** Project-owned coding/identifier systems.
 *  Avoids the prior LOINC mapping which used codes that don't actually
 *  exist in the LOINC code system. CDSA is an in-house instrument; codes
 *  are namespaced under the project domain. */
export const CODE_SYSTEM = 'https://smart-pedi-cds.yao.care/code';
export const ID_SYSTEM = 'https://smart-pedi-cds.yao.care/assessment';
export const CONFIDENCE_EXT_URL = 'https://smart-pedi-cds.yao.care/extension/triage-confidence';

const REPORT_CODE = {
  system: CODE_SYSTEM,
  code: 'cdsa-assessment',
  display: 'CDSA 兒童發展智慧評估',
};

/**
 * Build a FHIR Patient resource from CDSA Child data.
 * Note: minimal — only what's needed for the assessment context.
 */
export function buildChildPatient(child: Child): object {
  return {
    resourceType: 'Patient',
    id: child.id,
    birthDate: child.birthDate,
    gender: child.gender === 'other' ? 'unknown' : child.gender,
  };
}

function observationCode(domain: string, metric: string) {
  return {
    system: CODE_SYSTEM,
    code: `cdsa-${domain}-${metric}`,
    display: `CDSA ${domain}::${metric}`,
  };
}

/**
 * Build FHIR Observation resources for each assessment metric.
 * Each detail from triage result becomes a separate Observation, identified
 * by `${assessmentId}::${domain}::${metric}` under the project ID system so
 * the resolver can reverse-map a Bundle back to an Assessment.
 */
export function buildAssessmentObservations(
  assessment: Assessment,
  childId: string,
  triageResult: TriageResult,
): object[] {
  const observations: object[] = [];

  for (const detail of triageResult.details) {
    observations.push({
      resourceType: 'Observation',
      identifier: [
        {
          system: ID_SYSTEM,
          value: `${assessment.id}::${detail.domain}::${detail.metric}`,
        },
      ],
      status: 'final',
      category: [
        {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/observation-category',
              code: 'survey',
              display: 'Survey',
            },
          ],
        },
      ],
      code: {
        coding: [observationCode(detail.domain, detail.metric)],
        text: `CDSA ${detail.domain}::${detail.metric}`,
      },
      subject: { reference: `Patient/${childId}` },
      effectiveDateTime: new Date().toISOString(),
      valueQuantity: {
        value: detail.value,
        unit: detail.zScore !== null ? 'z-score' : 'score',
      },
      interpretation: [
        {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation',
              code: detail.isAnomaly ? 'A' : 'N',
              display: detail.isAnomaly ? 'Abnormal' : 'Normal',
            },
          ],
        },
      ],
      note: detail.zScore !== null
        ? [{ text: `Z-score: ${detail.zScore.toFixed(2)}` }]
        : undefined,
    });
  }

  return observations;
}

/**
 * Build a FHIR DiagnosticReport for the overall triage result.
 * Carries identifier (so resolver can find it), confidence (extension),
 * and effective period (so we can reconstruct startedAt / completedAt).
 */
export function buildTriageDiagnosticReport(
  assessment: Assessment,
  childId: string,
  triageResult: TriageResult,
  observationIds: string[],
): object {
  const startedAt = assessment.startedAt instanceof Date
    ? assessment.startedAt
    : new Date(assessment.startedAt);
  const completedAt = assessment.completedAt
    ? (assessment.completedAt instanceof Date
        ? assessment.completedAt
        : new Date(assessment.completedAt))
    : null;

  // FHIR requires effectivePeriod.end if present — degrade to effectiveDateTime
  // when the assessment hasn't completed.
  const effective = completedAt
    ? {
        effectivePeriod: {
          start: startedAt.toISOString(),
          end: completedAt.toISOString(),
        },
      }
    : { effectiveDateTime: startedAt.toISOString() };

  return {
    resourceType: 'DiagnosticReport',
    identifier: [
      { system: ID_SYSTEM, value: assessment.id },
    ],
    status: 'final',
    category: [
      {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/v2-0074',
            code: 'DEV',
            display: 'Developmental',
          },
        ],
      },
    ],
    code: { coding: [REPORT_CODE] },
    subject: { reference: `Patient/${childId}` },
    ...effective,
    issued: new Date().toISOString(),
    result: observationIds.map(id => ({ reference: `Observation/${id}` })),
    extension: [
      {
        url: CONFIDENCE_EXT_URL,
        valueDecimal: triageResult.confidence,
      },
    ],
    conclusion: triageResult.summary,
    conclusionCode: [
      {
        coding: [
          {
            system: 'http://snomed.info/sct',
            code: triageResult.category === 'normal' ? '17621005'
              : triageResult.category === 'monitor' ? '394848005'
              : '3457005',
            display: triageResult.category === 'normal' ? 'Normal'
              : triageResult.category === 'monitor' ? 'Follow-up'
              : 'Referral',
          },
        ],
      },
    ],
  };
}
