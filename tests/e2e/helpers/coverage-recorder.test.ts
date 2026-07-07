import { describe, it, expect, beforeEach } from 'vitest';
import { resetCoverage, recordCoverage, readCoverage } from './coverage-recorder';

describe('coverage-recorder', () => {
  beforeEach(() => resetCoverage());
  it('reset 後為空', () => {
    expect(readCoverage()).toEqual([]);
  });
  it('record 後可讀回、可累積', () => {
    recordCoverage({ kind: 'questionnaire', domain: 'gross_motor', age: '13-24m', score: 2 });
    recordCoverage({ kind: 'module', module: 'voice', age: '25-36m' });
    expect(readCoverage()).toHaveLength(2);
  });
});
