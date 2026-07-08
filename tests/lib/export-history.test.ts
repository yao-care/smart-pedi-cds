import { describe, it, expect } from 'vitest';
import {
  buildHistoryExport,
  historyExportFilename,
  countExportedAssessments,
  type ChildAssessments,
} from '../../src/lib/assessment/export-history';
import type { Child, Assessment } from '../../src/lib/db/schema';

function makeChild(overrides: Partial<Child> = {}): Child {
  return {
    id: 'child-1',
    birthDate: '2023-01-15',
    gender: 'female',
    nickName: '小明',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function makeAssessment(overrides: Partial<Assessment> = {}): Assessment {
  return {
    id: 'a-1',
    childId: 'child-1',
    status: 'completed',
    language: 'zh-TW',
    currentStep: 5,
    startedAt: new Date('2026-06-01T00:00:00.000Z'),
    completedAt: new Date('2026-06-01T00:10:00.000Z'),
    triageResult: { category: 'monitor', confidence: 0.7, summary: '待觀察' },
    fhirSubmitted: false,
    createdAt: new Date('2026-06-01T00:00:00.000Z'),
    updatedAt: new Date('2026-06-01T00:10:00.000Z'),
    ...overrides,
  };
}

const EXPORTED_AT = '2026-07-08T09:30:00.000Z';

describe('buildHistoryExport (B3)', () => {
  it('wraps children with self-describing format + version + timestamp', () => {
    const data: ChildAssessments[] = [
      { child: makeChild(), assessments: [makeAssessment()] },
    ];
    const out = buildHistoryExport(data, EXPORTED_AT);
    expect(out.format).toBe('smart-pedi-history');
    expect(out.version).toBe(1);
    expect(out.exportedAt).toBe(EXPORTED_AT);
    expect(out.children).toHaveLength(1);
    expect(out.children[0].assessments).toHaveLength(1);
  });

  it('preserves the user’s own local data including nickName (data portability)', () => {
    const data: ChildAssessments[] = [
      { child: makeChild({ nickName: '小明' }), assessments: [makeAssessment()] },
    ];
    const out = buildHistoryExport(data, EXPORTED_AT);
    expect(out.children[0].child.nickName).toBe('小明');
    expect(out.children[0].assessments[0].triageResult?.category).toBe('monitor');
  });

  it('deep-clones so mutating the source after export does not leak in', () => {
    const child = makeChild();
    const data: ChildAssessments[] = [{ child, assessments: [makeAssessment()] }];
    const out = buildHistoryExport(data, EXPORTED_AT);
    child.nickName = 'MUTATED';
    expect(out.children[0].child.nickName).toBe('小明');
  });

  it('produces JSON-serialisable output (Dates → ISO strings)', () => {
    const data: ChildAssessments[] = [
      { child: makeChild(), assessments: [makeAssessment()] },
    ];
    const out = buildHistoryExport(data, EXPORTED_AT);
    // round-trips without throwing and Date fields are strings after clone
    const round = JSON.parse(JSON.stringify(out));
    expect(typeof round.children[0].child.createdAt).toBe('string');
    expect(typeof round.children[0].assessments[0].startedAt).toBe('string');
  });

  it('handles empty data', () => {
    const out = buildHistoryExport([], EXPORTED_AT);
    expect(out.children).toEqual([]);
  });
});

describe('historyExportFilename (B3)', () => {
  it('derives a dated filename from the ISO timestamp', () => {
    expect(historyExportFilename(EXPORTED_AT)).toBe('smart-pedi-history-2026-07-08.json');
  });
});

describe('countExportedAssessments (B3)', () => {
  it('sums assessments across children', () => {
    const data: ChildAssessments[] = [
      { child: makeChild({ id: 'c1' }), assessments: [makeAssessment(), makeAssessment({ id: 'a-2' })] },
      { child: makeChild({ id: 'c2' }), assessments: [makeAssessment({ id: 'a-3' })] },
    ];
    expect(countExportedAssessments(data)).toBe(3);
  });

  it('returns 0 for empty data', () => {
    expect(countExportedAssessments([])).toBe(0);
  });
});
