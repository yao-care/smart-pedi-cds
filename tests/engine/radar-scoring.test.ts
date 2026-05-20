import { describe, it, expect } from 'vitest';
import { zToPercentile, computeDomainScores } from '../../src/engine/cdsa/radar-scoring';
import type { TriageResult } from '../../src/engine/cdsa/triage';

describe('zToPercentile', () => {
  it('z=0 → 0.5 exactly (short-circuit)', () => {
    expect(zToPercentile(0)).toBe(0.5);
  });

  it('z=+2 → ≈0.977 (within 1e-4)', () => {
    expect(zToPercentile(2)).toBeCloseTo(0.9772, 4);
  });

  it('z=-2 → ≈0.0228 (within 1e-4)', () => {
    expect(zToPercentile(-2)).toBeCloseTo(0.0228, 4);
  });

  it('z=+1 → ≈0.8413', () => {
    expect(zToPercentile(1)).toBeCloseTo(0.8413, 4);
  });

  it('z=-1 → ≈0.1587', () => {
    expect(zToPercentile(-1)).toBeCloseTo(0.1587, 4);
  });

  it('z=+1.5 → ≈0.9332', () => {
    expect(zToPercentile(1.5)).toBeCloseTo(0.9332, 4);
  });

  it('symmetry: P(z) + P(-z) = 1', () => {
    for (const z of [0.5, 1.2, 2.3, 3.0]) {
      expect(zToPercentile(z) + zToPercentile(-z)).toBeCloseTo(1, 5);
    }
  });
});

describe('computeDomainScores', () => {
  const mkDetail = (overrides: Partial<TriageResult['details'][number]>): TriageResult['details'][number] => ({
    domain: 'cognition', metric: 'questionnaireScore', value: 4,
    zScore: null, directionalZ: null, isAnomaly: false, maxScore: 4,
    ...overrides,
  });

  const mkResult = (details: TriageResult['details']): TriageResult => ({
    category: 'normal', confidence: 0.85, summary: '',
    anomalyCount: details.filter(d => d.isAnomaly).length,
    details,
  });

  it('returns empty for null triageResult', () => {
    expect(computeDomainScores(null)).toEqual([]);
  });

  it('pure questionnaire raw normalized × 100', () => {
    const result = mkResult([
      mkDetail({ domain: 'cognition', value: 4, maxScore: 4 }), // 1.0 → 100
      mkDetail({ domain: 'social_emotional', value: 1, maxScore: 4 }), // 0.25 → 25
    ]);
    const scores = computeDomainScores(result);
    expect(scores.find(s => s.domain === 'cognition')?.score).toBe(100);
    expect(scores.find(s => s.domain === 'social_emotional')?.score).toBe(25);
    expect(scores.find(s => s.domain === 'cognition')?.isHybrid).toBe(false);
  });

  it('pure z-score → percentile × 100', () => {
    const result = mkResult([
      mkDetail({ domain: 'behavior', metric: 'completionRate', value: 0.8, zScore: 2, directionalZ: 2, maxScore: null }),
      mkDetail({ domain: 'fine_motor', metric: 'drawingScore', value: 10, zScore: -2, directionalZ: -2, isAnomaly: true, maxScore: null }),
    ]);
    const scores = computeDomainScores(result);
    expect(scores.find(s => s.domain === 'behavior')?.score).toBeGreaterThanOrEqual(97);
    expect(scores.find(s => s.domain === 'behavior')?.score).toBeLessThanOrEqual(98);
    expect(scores.find(s => s.domain === 'fine_motor')?.score).toBeGreaterThanOrEqual(2);
    expect(scores.find(s => s.domain === 'fine_motor')?.score).toBeLessThanOrEqual(3);
  });

  it('hybrid path = average of raw and z percentile', () => {
    const result = mkResult([
      // fine_motor questionnaire full = rawPct 1.0
      mkDetail({ domain: 'fine_motor', metric: 'questionnaireScore', value: 4, maxScore: 4, zScore: null, directionalZ: null }),
      // fine_motor drawing z=0 → zPct 0.5
      mkDetail({ domain: 'fine_motor', metric: 'drawingScore', value: 55, zScore: 0, directionalZ: 0, maxScore: null }),
    ]);
    const score = computeDomainScores(result).find(s => s.domain === 'fine_motor');
    expect(score?.score).toBe(75); // round((1.0 + 0.5) / 2 * 100)
    expect(score?.isHybrid).toBe(true);
  });

  it('hasAnomaly bubbles up if any detail is anomalous', () => {
    const result = mkResult([
      mkDetail({ domain: 'language_comprehension', metric: 'questionnaireScore', value: 1, maxScore: 4, zScore: null, directionalZ: null, isAnomaly: true }),
    ]);
    expect(computeDomainScores(result).find(s => s.domain === 'language_comprehension')?.hasAnomaly).toBe(true);
  });

  it('falls back to score=50 when no raw or z data', () => {
    // directionalZ=null AND not a questionnaire metric → falls to default 50
    const result = mkResult([
      mkDetail({ domain: 'gross_motor', metric: 'poseClassification', value: 0.9, zScore: null, directionalZ: null, maxScore: null }),
    ]);
    const score = computeDomainScores(result).find(s => s.domain === 'gross_motor');
    expect(score?.score).toBe(50);
  });
});
