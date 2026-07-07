import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';

export type CoverageEntry =
  | { kind: 'questionnaire'; domain: string; age: string; score: number }
  | { kind: 'module'; module: string; age: string };

const FILE = 'test-results/coverage-actual.json';

function ensureDir(): void {
  mkdirSync(dirname(FILE), { recursive: true });
}

export function resetCoverage(): void {
  ensureDir();
  writeFileSync(FILE, '[]');
}

export function readCoverage(): CoverageEntry[] {
  if (!existsSync(FILE)) return [];
  return JSON.parse(readFileSync(FILE, 'utf8')) as CoverageEntry[];
}

export function recordCoverage(entry: CoverageEntry): void {
  ensureDir();
  const arr = readCoverage();
  arr.push(entry);
  writeFileSync(FILE, JSON.stringify(arr));
}
