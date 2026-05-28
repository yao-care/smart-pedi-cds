import { describe, it, expect } from 'vitest';
import { recomputeTriageResult, type PersistedTriageResult } from '../../src/lib/baselines/recompute-triage';

/**
 * recompute-triage 純函數單元測試。
 *
 * 涵蓋 spec §7.3 / §13.5 落地的 retroactive recomputation：
 *   - v5 舊問卷 detail（directionalZ=null）→ 重算後帶 z + ASQ-3 norm
 *   - 非問卷 detail（已有 directionalZ）→ z 不變、isAnomaly 套新 -1 SD 門檻
 *   - per-domain gating（refer/monitor/normal）的邊界條件
 *   - 缺欄位安全網（maxScore 缺、unknown domain、details 空）
 */

const baseResult: PersistedTriageResult = {
  category: 'normal',
  confidence: 0.85,
  summary: '',
  details: [],
};

describe('recomputeTriageResult — basic safety nets', () => {
  it('returns original result when details is undefined', () => {
    const out = recomputeTriageResult({ ...baseResult, details: undefined }, '25-36m');
    expect(out).toEqual({ ...baseResult, details: undefined });
  });

  it('returns original result when details is empty array', () => {
    const out = recomputeTriageResult(baseResult, '25-36m');
    expect(out).toEqual(baseResult);
  });
});

describe('recomputeTriageResult — questionnaire detail recompute', () => {
  it('recomputes z for v5 questionnaire detail (directionalZ was null)', () => {
    // cognition @ 25-36m → ASQ-3 Problem Solving @ 30m: mean=53.54, sd=8.70.
    // Scaled to maxScore=4 → mean ≈ 3.57, sd ≈ 0.58. score=4 → z ≈ +0.74 (above mean).
    const out = recomputeTriageResult({
      ...baseResult,
      details: [{
        domain: 'cognition',
        metric: 'questionnaireScore',
        value: 4,
        zScore: null,
        directionalZ: null, // v5 had no norm → null
        maxScore: 4,
        isAnomaly: false, // old rule: value/max=1.0 >= 0.5 → not anomaly
      }],
    }, '25-36m');
    const cog = out.details?.[0];
    expect(cog).toBeDefined();
    expect(cog?.directionalZ).not.toBeNull();
    expect(cog?.directionalZ).toBeGreaterThan(0); // full score → above mean
    expect(cog?.normMean).toBeGreaterThan(0);
    expect(cog?.normStd).toBeGreaterThan(0);
    expect(cog?.isAnomaly).toBe(false); // z > -1
  });

  it('marks isAnomaly=true when recomputed z ≤ -1 SD', () => {
    // cognition @ 25-36m, maxScore=4, score=1 → z ≈ -4.43 → anomaly
    const out = recomputeTriageResult({
      ...baseResult,
      details: [{
        domain: 'cognition',
        metric: 'questionnaireScore',
        value: 1,
        zScore: null,
        directionalZ: null,
        maxScore: 4,
        isAnomaly: false, // old: 1/4=0.25 → was anomaly in old rule too
      }],
    }, '25-36m');
    const cog = out.details?.[0];
    expect(cog?.directionalZ).toBeLessThan(-2);
    expect(cog?.isAnomaly).toBe(true);
  });

  it('keeps detail (does not drop) when maxScore is missing — applies new isAnomaly threshold instead', () => {
    const out = recomputeTriageResult({
      ...baseResult,
      details: [{
        domain: 'cognition',
        metric: 'questionnaireScore',
        value: 2,
        zScore: -0.5, // old z (somehow)
        directionalZ: -0.5,
        maxScore: undefined, // ← v5 record without maxScore (corner case)
        isAnomaly: false,
      }],
    }, '25-36m');
    expect(out.details).toHaveLength(1);
    const detail = out.details?.[0];
    // -0.5 > -1 → not anomaly under new rule
    expect(detail?.isAnomaly).toBe(false);
    // norm fields NOT recomputed (no maxScore to scale)
    expect(detail?.normMean).toBeUndefined();
  });

  it('keeps detail for unknown questionnaire domain — only updates isAnomaly via old directionalZ', () => {
    const out = recomputeTriageResult({
      ...baseResult,
      details: [{
        domain: 'unknown_domain',
        metric: 'questionnaireScore',
        value: 2,
        zScore: -1.5,
        directionalZ: -1.5,
        maxScore: 4,
        isAnomaly: true,
      }],
    }, '25-36m');
    const detail = out.details?.[0];
    expect(detail).toBeDefined();
    expect(detail?.directionalZ).toBe(-1.5); // not recomputed
    expect(detail?.isAnomaly).toBe(true); // -1.5 <= -1
  });
});

describe('recomputeTriageResult — non-questionnaire detail', () => {
  it('preserves directionalZ but re-applies new -1 SD anomaly threshold', () => {
    // Old isAnomaly threshold was -1.5; new is -1. A drawing detail with z=-1.2:
    //   OLD: isAnomaly=false (-1.2 > -1.5)
    //   NEW: isAnomaly=true  (-1.2 <= -1)
    const out = recomputeTriageResult({
      ...baseResult,
      details: [{
        domain: 'fine_motor',
        metric: 'drawingScore',
        value: 30,
        zScore: -1.2,
        directionalZ: -1.2,
        isAnomaly: false, // old
      }],
    }, '25-36m');
    const d = out.details?.[0];
    expect(d?.directionalZ).toBe(-1.2); // unchanged
    expect(d?.isAnomaly).toBe(true); // re-applied new threshold
  });

  it('leaves directionalZ=null detail untouched (no anomaly flip)', () => {
    const out = recomputeTriageResult({
      ...baseResult,
      details: [{
        domain: 'gross_motor',
        metric: 'poseClassification',
        value: 0.8,
        zScore: null,
        directionalZ: null,
        isAnomaly: false,
      }],
    }, '25-36m');
    const d = out.details?.[0];
    expect(d?.directionalZ).toBeNull();
    expect(d?.isAnomaly).toBe(false); // original preserved
  });
});

describe('recomputeTriageResult — per-domain gating (spec §7.2)', () => {
  it('refer when any domain composite z ≤ -2 SD', () => {
    // behavior domain: 4 metrics avg = mean(-3, -2, -2.5, -3) = -2.625 → refer
    const out = recomputeTriageResult({
      ...baseResult,
      details: [
        { domain: 'behavior', metric: 'completionRate', value: 0.2, zScore: -3, directionalZ: -3, isAnomaly: true },
        { domain: 'behavior', metric: 'operationConsistency', value: 0.4, zScore: -2, directionalZ: -2, isAnomaly: true },
        { domain: 'behavior', metric: 'reactionLatency', value: 4000, zScore: 2.5, directionalZ: -2.5, isAnomaly: true },
        { domain: 'behavior', metric: 'interactionRhythm', value: 0.1, zScore: -3, directionalZ: -3, isAnomaly: true },
      ],
    }, '25-36m');
    expect(out.category).toBe('refer');
    expect(out.domainCategories?.behavior).toBe('refer');
    expect(out.domainLevelZ?.behavior).toBeLessThanOrEqual(-2);
    expect(out.summary).toContain('行為');
    expect(out.summary).toContain('專業評估');
  });

  it('monitor when any domain composite z in (-2, -1]', () => {
    // behavior avg = mean(-1.5, -1, 0, 0) = -0.625 → normal
    // → bump one to put avg into monitor band: mean(-2, -1, 0, 0) = -0.75 → still normal
    // try: mean(-2, -2, 0, 0) = -1.0 → monitor (boundary)
    const out = recomputeTriageResult({
      ...baseResult,
      details: [
        { domain: 'behavior', metric: 'completionRate', value: 0.3, zScore: -2, directionalZ: -2, isAnomaly: true },
        { domain: 'behavior', metric: 'operationConsistency', value: 0.4, zScore: -2, directionalZ: -2, isAnomaly: true },
        { domain: 'behavior', metric: 'reactionLatency', value: 2000, zScore: 0, directionalZ: 0, isAnomaly: false },
        { domain: 'behavior', metric: 'interactionRhythm', value: 0.5, zScore: 0, directionalZ: 0, isAnomaly: false },
      ],
    }, '25-36m');
    expect(out.domainLevelZ?.behavior).toBeCloseTo(-1.0);
    expect(out.domainCategories?.behavior).toBe('monitor');
    expect(out.category).toBe('monitor');
    expect(out.summary).toContain('行為');
    expect(out.summary).toContain('追蹤');
  });

  it('normal when all domains > -1 SD', () => {
    const out = recomputeTriageResult({
      ...baseResult,
      details: [
        { domain: 'behavior', metric: 'completionRate', value: 0.7, zScore: -0.3, directionalZ: -0.3, isAnomaly: false },
        { domain: 'fine_motor', metric: 'drawingScore', value: 55, zScore: 0, directionalZ: 0, isAnomaly: false },
      ],
    }, '25-36m');
    expect(out.category).toBe('normal');
    expect(out.domainCategories?.behavior).toBe('normal');
    expect(out.domainCategories?.fine_motor).toBe('normal');
    expect(out.summary).toContain('正常範圍');
  });

  it('integration: v5 record with stale category gets refreshed end-to-end', () => {
    // v5 saved: triage thought it was "monitor" with anomalyCount=2.
    // After recompute under per-domain gating: same details now show refer
    // because cognition composite z is below -2.
    const old: PersistedTriageResult = {
      category: 'monitor',
      confidence: 0.75,
      summary: '舊文案',
      anomalyCount: 2,
      details: [
        // questionnaire — old format with no z
        {
          domain: 'cognition',
          metric: 'questionnaireScore',
          value: 1, // 1/4 → old anomaly (below half)
          zScore: null,
          directionalZ: null,
          maxScore: 4,
          isAnomaly: true,
        },
        // drawing z-based — already had z in v5
        {
          domain: 'fine_motor',
          metric: 'drawingScore',
          value: 30,
          zScore: -1.2,
          directionalZ: -1.2,
          isAnomaly: false, // old threshold -1.5
        },
      ],
    };
    const out = recomputeTriageResult(old, '25-36m');
    // cognition score=1 maxScore=4 → z ≈ -4.43 → refer at -2 cutoff
    expect(out.domainLevelZ?.cognition).toBeLessThan(-2);
    expect(out.domainCategories?.cognition).toBe('refer');
    // fine_motor z=-1.2 → monitor band
    expect(out.domainLevelZ?.fine_motor).toBeCloseTo(-1.2);
    expect(out.domainCategories?.fine_motor).toBe('monitor');
    // Overall = refer (any refer wins)
    expect(out.category).toBe('refer');
    // anomalyCount refreshed: cognition (-4.43) and drawing (-1.2) both ≤ -1
    expect(out.anomalyCount).toBe(2);
    // Summary refreshed
    expect(out.summary).toContain('認知');
    expect(out.summary).not.toContain('舊文案');
  });
});

describe('recomputeTriageResult — confidence scaling', () => {
  it('refer confidence rises with affected domain count', () => {
    const oneRefer = recomputeTriageResult({
      ...baseResult,
      details: [
        { domain: 'behavior', metric: 'completionRate', value: 0, zScore: -5, directionalZ: -5, isAnomaly: true },
      ],
    }, '25-36m');
    const twoRefer = recomputeTriageResult({
      ...baseResult,
      details: [
        { domain: 'behavior', metric: 'completionRate', value: 0, zScore: -5, directionalZ: -5, isAnomaly: true },
        { domain: 'fine_motor', metric: 'drawingScore', value: 0, zScore: -3, directionalZ: -3, isAnomaly: true },
      ],
    }, '25-36m');
    expect(twoRefer.confidence).toBeGreaterThan(oneRefer.confidence);
    expect(twoRefer.confidence).toBeLessThanOrEqual(0.95);
  });

  it('normal baseline confidence = 0.85', () => {
    const out = recomputeTriageResult({
      ...baseResult,
      details: [
        { domain: 'behavior', metric: 'completionRate', value: 0.75, zScore: 0, directionalZ: 0, isAnomaly: false },
      ],
    }, '25-36m');
    expect(out.category).toBe('normal');
    expect(out.confidence).toBe(0.85);
  });
});
