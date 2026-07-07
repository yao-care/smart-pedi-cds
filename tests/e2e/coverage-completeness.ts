import { expectedQuestionnaireUnits, expectedActiveModuleCells } from './coverage-expected';
import { readCoverage, type CoverageEntry } from './helpers/coverage-recorder';

function keyOf(e: CoverageEntry): string {
  return e.kind === 'questionnaire'
    ? `q:${e.age}:${e.domain}:${e.score}`
    : `m:${e.age}:${e.module}`;
}

export interface AuditReport {
  missing: string[];
  extra: string[];
  coveredPct: number;
  byAge: Record<string, { covered: number; total: number }>;
}

export function auditCoverage(actual: CoverageEntry[]): AuditReport {
  const expected: CoverageEntry[] = [
    ...expectedQuestionnaireUnits().map(u => ({ kind: 'questionnaire', domain: u.domain, age: u.age, score: u.score } as CoverageEntry)),
    ...expectedActiveModuleCells().map(c => ({ kind: 'module', module: c.module, age: c.age } as CoverageEntry)),
  ];
  const expectedKeys = new Set(expected.map(keyOf));
  const actualKeys = new Set(actual.map(keyOf));

  const missing = [...expectedKeys].filter(k => !actualKeys.has(k)).sort();
  const extra = [...actualKeys].filter(k => !expectedKeys.has(k)).sort();

  const byAge: Record<string, { covered: number; total: number }> = {};
  for (const e of expected) {
    const age = 'age' in e ? e.age : '';
    (byAge[age] ??= { covered: 0, total: 0 }).total++;
    if (actualKeys.has(keyOf(e))) byAge[age].covered++;
  }

  const coveredPct = Math.floor(((expectedKeys.size - missing.length) / expectedKeys.size) * 100);
  return { missing, extra, coveredPct, byAge };
}

export function formatReport(r: AuditReport): string {
  const lines: string[] = [];
  lines.push('檢測覆蓋完整性稽核');
  lines.push(`涵蓋率 ${r.coveredPct}%　漏測 ${r.missing.length}　逾測 ${r.extra.length}`);
  lines.push(`漏測（應測未跑）：${r.missing.length ? '' : '無'}`);
  for (const k of r.missing) lines.push(`  - ${k}`);
  lines.push(`逾測（無題卻測）：${r.extra.length ? '' : '無'}`);
  for (const k of r.extra) lines.push(`  - ${k}`);
  lines.push('── 分齡明細 ──');
  for (const [age, s] of Object.entries(r.byAge)) {
    lines.push(`${age}\t${s.covered}/${s.total}${s.covered === s.total ? ' ✓' : ' ✗'}`);
  }
  return lines.join('\n');
}

// CLI 進入點
if (process.argv[1] && process.argv[1].endsWith('coverage-completeness.ts')) {
  const report = auditCoverage(readCoverage());
  console.log(formatReport(report));
  process.exitCode = report.missing.length ? 1 : 0;
}
