import type { TriageResult } from '../../engine/cdsa/triage';
import type { Assessment, Child } from '../db/schema';

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

/**
 * Build FHIR Observation resources for each assessment metric.
 * Each detail from triage result becomes a separate Observation.
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
        coding: [
          {
            system: 'http://loinc.org',
            code: mapDomainToLoinc(detail.domain),
            display: `${detail.domain} - ${detail.metric}`,
          },
        ],
        text: `CDSA ${detail.domain}: ${detail.metric}`,
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
 */
export function buildTriageDiagnosticReport(
  assessment: Assessment,
  childId: string,
  triageResult: TriageResult,
  observationIds: string[],
): object {
  const conclusionMap = {
    normal: '各面向發展在正常範圍內',
    monitor: '部分面向需持續追蹤觀察',
    refer: '建議進一步專業評估',
  };

  return {
    resourceType: 'DiagnosticReport',
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
    code: {
      coding: [
        {
          system: 'http://loinc.org',
          code: '71446-2',
          display: 'Developmental screening assessment',
        },
      ],
      text: 'CDSA 兒童發展智慧評估報告',
    },
    subject: { reference: `Patient/${childId}` },
    effectiveDateTime: assessment.startedAt instanceof Date
      ? assessment.startedAt.toISOString()
      : new Date(assessment.startedAt).toISOString(),
    issued: new Date().toISOString(),
    result: observationIds.map(id => ({ reference: `Observation/${id}` })),
    conclusion: `${conclusionMap[triageResult.category]}（信心度 ${Math.round(triageResult.confidence * 100)}%）。${triageResult.summary}`,
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

/**
 * Map CDSA domain names to approximate LOINC codes.
 */
function mapDomainToLoinc(domain: string): string {
  const map: Record<string, string> = {
    gross_motor: '71441-3',      // Gross motor milestone
    fine_motor: '71442-1',       // Fine motor milestone
    language: '71443-9',         // Language milestone
    language_comprehension: '71443-9',
    language_expression: '71444-7',
    cognition: '71445-4',        // Cognitive milestone
    social_emotional: '71446-2', // Social-emotional milestone
    behavior: '71447-0',         // Behavior observation
  };
  return map[domain] ?? '71446-2';
}
