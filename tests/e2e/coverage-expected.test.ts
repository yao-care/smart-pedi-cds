import { describe, it, expect } from 'vitest';
import { expectedQuestionnaireUnits, expectedActiveModuleCells } from './coverage-expected';

describe('coverage-expected', () => {
  it('問卷單元共 190 筆', () => {
    expect(expectedQuestionnaireUnits()).toHaveLength(190);
  });
  it('2-6m 不含 cognition / language_expression', () => {
    const units = expectedQuestionnaireUnits().filter(u => u.age === '2-6m');
    const domains = new Set(units.map(u => u.domain));
    expect(domains.has('cognition')).toBe(false);
    expect(domains.has('language_expression')).toBe(false);
  });
  it('每單元 score 落在 0..maxScore', () => {
    for (const u of expectedQuestionnaireUnits()) {
      expect(u.score).toBeGreaterThanOrEqual(0);
      expect(u.score).toBeLessThanOrEqual(u.maxScore);
    }
  });
  it('主動模組 26 格：voice 僅 13m+，其餘全 7 齡', () => {
    const cells = expectedActiveModuleCells();
    expect(cells).toHaveLength(26);
    const voiceAges = cells.filter(c => c.module === 'voice').map(c => c.age);
    expect(voiceAges).not.toContain('2-6m');
    expect(voiceAges).not.toContain('7-12m');
    expect(voiceAges).toHaveLength(5);
  });
});
