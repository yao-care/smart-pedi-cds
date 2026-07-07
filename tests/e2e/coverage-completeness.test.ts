import { describe, it, expect } from 'vitest';
import { auditCoverage } from './coverage-completeness';
import { expectedQuestionnaireUnits, expectedActiveModuleCells } from './coverage-expected';
import type { CoverageEntry } from './helpers/coverage-recorder';

function fullActual(): CoverageEntry[] {
  const q = expectedQuestionnaireUnits().map(u => ({ kind: 'questionnaire', domain: u.domain, age: u.age, score: u.score } as CoverageEntry));
  const m = expectedActiveModuleCells().map(c => ({ kind: 'module', module: c.module, age: c.age } as CoverageEntry));
  return [...q, ...m];
}

describe('auditCoverage', () => {
  it('完整覆蓋 → 無漏、100%', () => {
    const r = auditCoverage(fullActual());
    expect(r.missing).toHaveLength(0);
    expect(r.coveredPct).toBe(100);
  });
  it('缺一單元 → 列出該漏測', () => {
    const actual = fullActual().slice(1); // 少第一筆
    const r = auditCoverage(actual);
    expect(r.missing).toHaveLength(1);
    expect(r.coveredPct).toBeLessThan(100);
  });
  it('無題卻測 → 列 extra', () => {
    const actual = [...fullActual(), { kind: 'questionnaire', domain: 'cognition', age: '2-6m', score: 0 } as CoverageEntry];
    const r = auditCoverage(actual);
    expect(r.extra).toHaveLength(1);
  });
});
