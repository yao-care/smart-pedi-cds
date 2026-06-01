import { describe, it, expect } from 'vitest';
import { GCM, PARTNER_INTAKE_POINTS } from '../../../src/lib/fhir/gcm-config';

describe('gcm-config', () => {
  it('base 與 intakeUrl 固定', () => {
    expect(GCM.base).toBe('https://gcm.fhir.yao.care');
    expect(GCM.intakeUrl).toBe('https://gcm.org.tw/fhir/Questionnaire/gcm-intake');
  });

  it('scopes 不含 openid / fhirUser（GCM 不支援 OIDC）', () => {
    expect(GCM.scopes).not.toMatch(/openid/);
    expect(GCM.scopes).not.toMatch(/fhirUser/);
    expect(GCM.scopes).toContain('launch/patient');
    expect(GCM.scopes).toContain('patient/Observation.c');
    expect(GCM.scopes).toContain('offline_access');
  });

  it('PARTNER_INTAKE_POINTS 含 gcm 條目', () => {
    const gcm = PARTNER_INTAKE_POINTS.find(p => p.id === 'gcm');
    expect(gcm).toBeDefined();
    expect(gcm?.fhirBaseUrl).toBe('https://gcm.fhir.yao.care');
    expect(gcm?.requiredScopes).toBe(GCM.scopes);
  });
});
