import { describe, it, expect } from 'vitest';
import { expectedQuestionnaireZ, categoryFromZ } from './expected-norms';
import { getQuestionnaireNorm } from '../../../src/lib/baselines/questionnaire-norms';

describe('expectedQuestionnaireZ', () => {
  it('與生產 getQuestionnaireNorm 交叉一致（獨立實作、同結果）', () => {
    const cases = [
      { d: 'gross_motor', a: '13-24m', s: 0, m: 4 },
      { d: 'cognition', a: '25-36m', s: 3, m: 4 },
      { d: 'social_emotional', a: '2-6m', s: 2, m: 2 },
    ] as const;
    for (const c of cases) {
      const norm = getQuestionnaireNorm(c.d, c.a, c.m);
      const expectedZ = (c.s - norm.mean) / norm.sd;
      expect(expectedQuestionnaireZ(c.d, c.a, c.s, c.m)).toBeCloseTo(expectedZ, 6);
    }
  });
  it('categoryFromZ 用 -2/-1 門檻', () => {
    expect(categoryFromZ(-2.5)).toBe('refer');
    expect(categoryFromZ(-2)).toBe('refer');
    expect(categoryFromZ(-1.5)).toBe('monitor');
    expect(categoryFromZ(-1)).toBe('monitor');
    expect(categoryFromZ(-0.5)).toBe('normal');
  });
});
