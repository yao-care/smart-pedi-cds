import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from '../../../src/lib/db/schema';

// Mock the fhir helpers so we exercise the resolver branches without HTTP.
const fetchMock = vi.fn();
const refreshMock = vi.fn();
const isAuthorizedMock = vi.fn();
const getClientMock = vi.fn();

vi.mock('../../../src/lib/fhir/assessment-fetch', () => ({
  fetchAssessmentFromFhir: (...args: unknown[]) => fetchMock(...args),
}));

vi.mock('../../../src/lib/fhir/client', () => ({
  getClient: () => getClientMock(),
  refreshToken: () => refreshMock(),
  isAuthorized: () => isAuthorizedMock(),
}));

import { resolveAssessment } from '../../../src/lib/db/assessment-resolver';
import type { Assessment } from '../../../src/lib/db/schema';

function makeRemote(id: string): Assessment {
  return {
    id,
    childId: 'child-x',
    status: 'completed',
    language: 'zh-TW',
    currentStep: 7,
    startedAt: new Date('2026-05-14T10:00:00Z'),
    completedAt: new Date('2026-05-14T10:25:00Z'),
    triageResult: { category: 'monitor', confidence: 0.87, summary: 's' },
    fhirSubmitted: true,
    fhirDiagnosticReportId: 'fhir-report-1',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

beforeEach(async () => {
  await db.assessments.clear();
  fetchMock.mockReset();
  refreshMock.mockReset();
  isAuthorizedMock.mockReset();
  getClientMock.mockReset();
  getClientMock.mockReturnValue({});
});

describe('resolveAssessment', () => {
  it('returns IDB record as source=idb when local copy exists', async () => {
    const a = makeRemote('local-1');
    await db.assessments.put(a);
    const r = await resolveAssessment('local-1');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.source).toBe('idb');
  });

  it('returns IDB record as source=fhir when _source is fhir-cache', async () => {
    const a = { ...makeRemote('cached-1'), _source: 'fhir-cache' as const };
    await db.assessments.put(a);
    const r = await resolveAssessment('cached-1');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.source).toBe('fhir');
  });

  it('not_found when IDB miss and not authorised', async () => {
    isAuthorizedMock.mockReturnValue(false);
    const r = await resolveAssessment('missing');
    expect(r).toEqual({ ok: false, error: 'not_found' });
  });

  it('falls back to FHIR and caches as fhir-cache', async () => {
    isAuthorizedMock.mockReturnValue(true);
    fetchMock.mockResolvedValue(makeRemote('remote-1'));
    const r = await resolveAssessment('remote-1');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.source).toBe('fhir');
    const cached = await db.assessments.get('remote-1');
    expect(cached?._source).toBe('fhir-cache');
  });

  it('returns not_found when FHIR replies null', async () => {
    isAuthorizedMock.mockReturnValue(true);
    fetchMock.mockResolvedValue(null);
    const r = await resolveAssessment('missing-remote');
    expect(r).toEqual({ ok: false, error: 'not_found' });
  });

  it('retries once after 401 and succeeds', async () => {
    isAuthorizedMock.mockReturnValue(true);
    fetchMock
      .mockRejectedValueOnce({ status: 401 })
      .mockResolvedValueOnce(makeRemote('retry-1'));
    refreshMock.mockResolvedValue(undefined);
    const r = await resolveAssessment('retry-1');
    expect(r.ok).toBe(true);
    expect(refreshMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('surfaces token_expired when refresh + retry both fail', async () => {
    isAuthorizedMock.mockReturnValue(true);
    fetchMock.mockRejectedValue({ status: 401 });
    refreshMock.mockRejectedValue(new Error('refresh failed'));
    const r = await resolveAssessment('expired');
    expect(r).toEqual({ ok: false, error: 'token_expired' });
  });

  it('maps 403 to forbidden', async () => {
    isAuthorizedMock.mockReturnValue(true);
    fetchMock.mockRejectedValue({ status: 403 });
    const r = await resolveAssessment('forbidden-id');
    expect(r).toEqual({ ok: false, error: 'forbidden' });
  });

  it('maps 404 to not_found', async () => {
    isAuthorizedMock.mockReturnValue(true);
    fetchMock.mockRejectedValue({ status: 404 });
    const r = await resolveAssessment('not-there');
    expect(r).toEqual({ ok: false, error: 'not_found' });
  });

  it('maps other errors to network', async () => {
    isAuthorizedMock.mockReturnValue(true);
    fetchMock.mockRejectedValue(new TypeError('failed to fetch'));
    const r = await resolveAssessment('boom');
    expect(r).toEqual({ ok: false, error: 'network' });
  });
});
