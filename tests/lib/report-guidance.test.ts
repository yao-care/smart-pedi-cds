import { describe, it, expect } from 'vitest';
import {
  getStrengthLabels,
  getNextSteps,
  REASSURANCE_TEXT,
  HOW_TO_USE_ITEMS,
} from '../../src/lib/assessment/report-guidance';
import type { DomainScore } from '../../src/engine/cdsa/radar-scoring';

function ds(domain: string, score: number): DomainScore {
  return { domain, score, hasAnomaly: score < 50, isHybrid: false };
}

describe('getStrengthLabels', () => {
  it('returns ≥50 domains as Chinese labels, highest first, max 3', () => {
    const scores = [
      ds('gross_motor', 40), ds('cognition', 79), ds('social_emotional', 76),
      ds('fine_motor', 55), ds('language_comprehension', 15), ds('behavior', 60),
    ];
    const out = getStrengthLabels(scores);
    expect(out).toEqual(['認知', '社交情緒', '行為']); // 79, 76, 60 — top 3 ≥50
  });

  it('excludes below-50 domains', () => {
    const out = getStrengthLabels([ds('gross_motor', 1), ds('language_expression', 19)]);
    expect(out).toEqual([]);
  });

  it('handles empty input', () => {
    expect(getStrengthLabels([])).toEqual([]);
  });
});

describe('getNextSteps', () => {
  it('refer includes referral pathway (聯合評估中心)', () => {
    const steps = getNextSteps('refer');
    expect(steps.length).toBeGreaterThan(0);
    expect(steps.join('')).toContain('聯合評估中心');
    expect(steps.join('')).toContain('通報轉介中心');
  });

  it('monitor gives at-home + re-evaluate guidance, no clinical alarm', () => {
    const steps = getNextSteps('monitor');
    expect(steps.length).toBeGreaterThan(0);
    expect(steps.join('')).toContain('不需要緊張');
  });

  it('normal gives affirmation + re-screen timing', () => {
    const steps = getNextSteps('normal');
    expect(steps.length).toBeGreaterThan(0);
    expect(steps.join('')).toContain('同齡常見範圍');
  });
});

describe('static copy', () => {
  it('reassurance de-stigmatises self-blame', () => {
    expect(REASSURANCE_TEXT).toContain('和教養方式無關');
  });

  it('how-to-use warns against labelling in front of the child', () => {
    expect(HOW_TO_USE_ITEMS.join('')).toContain('避免在孩子面前');
  });
});
