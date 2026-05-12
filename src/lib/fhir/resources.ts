import type { Patient, Observation, Alert } from '../db/schema';
import { indicatorByLoinc } from '../utils/loinc-map';
import { ageGroup } from '../utils/date';

// ---- FHIR R4 Resource Types (minimal, relevant fields only) ----

export interface FhirPatient {
  resourceType: 'Patient';
  id: string;
  name?: Array<{ given?: string[]; family?: string; text?: string }>;
  birthDate?: string;
  gender?: 'male' | 'female' | 'other' | 'unknown';
}

export interface FhirObservation {
  resourceType: 'Observation';
  id: string;
  status: string;
  subject?: { reference?: string };
  code?: {
    coding?: Array<{ system?: string; code?: string; display?: string }>;
  };
  valueQuantity?: { value?: number; unit?: string };
  effectiveDateTime?: string;
}

export interface FhirRiskAssessment {
  resourceType: 'RiskAssessment';
  id?: string;
  status: 'preliminary' | 'final' | 'amended';
  subject: { reference: string };
  occurrenceDateTime: string;
  prediction: Array<{
    outcome: { text: string };
    qualitativeRisk: { coding: Array<{ system: string; code: string; display: string }> };
  }>;
  basis?: Array<{ reference: string }>;
  note?: Array<{ text: string }>;
}

export interface FhirBundle<T = unknown> {
  resourceType: 'Bundle';
  type: string;
  total?: number;
  entry?: Array<{ resource: T; fullUrl?: string }>;
  link?: Array<{ relation: string; url: string }>;
}

// ---- Mapping Functions ----

export function fhirPatientToLocal(fhir: FhirPatient): Patient {
  const name = fhir.name?.[0];
  const displayName = name?.text ?? [name?.family, ...(name?.given ?? [])].filter(Boolean).join(' ');
  const gender = (fhir.gender === 'male' || fhir.gender === 'female') ? fhir.gender : 'male'; // default

  return {
    id: fhir.id,
    name: displayName || undefined,
    birthDate: fhir.birthDate ?? '',
    gender,
    ageGroup: fhir.birthDate ? ageGroup(fhir.birthDate) : 'infant',
    currentRiskLevel: 'normal',
    lastSyncedAt: new Date(),
  };
}

export function fhirObservationToLocal(fhir: FhirObservation): Observation | null {
  const loincCode = fhir.code?.coding?.find(c => c.system === 'http://loinc.org')?.code;
  if (!loincCode) return null;

  const indicator = indicatorByLoinc(loincCode);
  if (!indicator) return null; // not a tracked indicator

  const patientRef = fhir.subject?.reference;
  const patientId = patientRef?.replace('Patient/', '') ?? '';

  if (fhir.valueQuantity?.value === undefined) return null;

  return {
    id: fhir.id,
    patientId,
    indicator: loincCode,
    value: fhir.valueQuantity!.value!,
    unit: fhir.valueQuantity!.unit ?? '',
    effectiveDateTime: fhir.effectiveDateTime ? new Date(fhir.effectiveDateTime) : new Date(),
    syncedAt: new Date(),
  };
}

export function localAlertToFhirRiskAssessment(
  alert: Alert,
  patientId: string,
): FhirRiskAssessment {
  return {
    resourceType: 'RiskAssessment',
    status: 'final',
    subject: { reference: `Patient/${patientId}` },
    occurrenceDateTime: alert.createdAt.toISOString(),
    prediction: [
      {
        outcome: { text: alert.rationale },
        qualitativeRisk: {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/risk-probability',
              code: alert.riskLevel,
              display: alert.riskLevel,
            },
          ],
        },
      },
    ],
    note: alert.notes ? [{ text: alert.notes }] : undefined,
  };
}
