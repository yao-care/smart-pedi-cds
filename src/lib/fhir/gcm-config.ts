/** GCM 收案 server 整合契約常數（server 已上線且固定）。 */
export const GCM = {
  base: 'https://gcm.fhir.yao.care',
  intakeUrl: 'https://gcm.org.tw/fhir/Questionnaire/gcm-intake',
  scopes:
    'launch/patient patient/Observation.c patient/DiagnosticReport.c patient/QuestionnaireResponse.c patient/Patient.u offline_access',
} as const;

export interface PartnerIntakePoint {
  id: string;
  name: string;
  fhirBaseUrl: string;
  intakeQuestionnaireUrl: string;
  requiredScopes: string;
}

/** 合作收案機構清單。目前一筆 GCM，可後續擴充。 */
export const PARTNER_INTAKE_POINTS: PartnerIntakePoint[] = [
  {
    id: 'gcm',
    name: 'GCM 預防醫學發展協會',
    fhirBaseUrl: GCM.base,
    intakeQuestionnaireUrl: GCM.intakeUrl,
    requiredScopes: GCM.scopes,
  },
];
