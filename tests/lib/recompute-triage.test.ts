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

describe('recomputeTriageResult — voice domain migration (v8)', () => {
  it('migrates legacy voice detail domain language → language_expression', () => {
    const out = recomputeTriageResult({
      ...baseResult,
      details: [{
        domain: 'language', // legacy
        metric: 'voiceDuration',
        value: 10,
        zScore: 0.4,
        directionalZ: 0.4,
        isAnomaly: false,
      }],
    }, '25-36m');
    const d = out.details?.[0];
    expect(d?.domain).toBe('language_expression'); // migrated
    expect(d?.metric).toBe('voiceDuration'); // metric unchanged
    // 遷移後不得再有孤立的 'language' domain（雷達重複來源）。
    expect(out.details?.some((x) => x.domain === 'language')).toBe(false);
  });

  it('voice does NOT dilute a questionnaire language_expression refer signal (display-only)', () => {
    // 語音正常（z 正）與問卷 refer（重算後 z 極負）併入同 domain 後，若未排除
    // voice 會被平均拉回 monitor/normal。recompute 的 gating 必須排除 voiceDuration。
    // 問卷 detail 於 recompute 會用真實常模重算 z，故不斷言具體值，改用「有無
    // voice 的 gating 結果一致」對照驗證未稀釋。
    const q = { domain: 'language_expression', metric: 'questionnaireScore', value: 2, zScore: -3, directionalZ: -3, maxScore: 20, isAnomaly: true };
    const voice = { domain: 'language', metric: 'voiceDuration', value: 10, zScore: 0.4, directionalZ: 0.4, isAnomaly: false };
    const withVoice = recomputeTriageResult({ ...baseResult, details: [voice, q] }, '25-36m');
    const withoutVoice = recomputeTriageResult({ ...baseResult, details: [q] }, '25-36m');
    expect(withoutVoice.domainCategories?.language_expression).toBe('refer');
    expect(withVoice.domainCategories?.language_expression).toBe('refer');
    expect(withVoice.domainLevelZ?.language_expression).toBeCloseTo(
      withoutVoice.domainLevelZ!.language_expression, 10,
    );
  });

  it('excludes pose from gating too (fixes pre-v8 recompute pose-dilution gap, B1)', () => {
    // 回歸：此前 recompute 未排除 poseClassification，pose 'normal'(z=0) 會稀釋
    // 問卷 gross_motor refer。補排除後與 live triage 一致。
    const q = { domain: 'gross_motor', metric: 'questionnaireScore', value: 2, zScore: -3, directionalZ: -3, maxScore: 20, isAnomaly: true };
    const pose = { domain: 'gross_motor', metric: 'poseClassification', value: 0.9, zScore: 0, directionalZ: 0, isAnomaly: false };
    const withPose = recomputeTriageResult({ ...baseResult, details: [pose, q] }, '25-36m');
    const withoutPose = recomputeTriageResult({ ...baseResult, details: [q] }, '25-36m');
    expect(withoutPose.domainCategories?.gross_motor).toBe('refer');
    expect(withPose.domainCategories?.gross_motor).toBe('refer');
    expect(withPose.domainLevelZ?.gross_motor).toBeCloseTo(
      withoutPose.domainLevelZ!.gross_motor, 10,
    );
  });
});

describe('recomputeTriageResult — gating whitelist (drawing/behavior)', () => {
  it('drawing does not dilute, and behavior does not gate, after recompute', () => {
    const out = recomputeTriageResult({
      ...baseResult,
      details: [
        { domain: 'fine_motor', metric: 'drawingScore', value: 60, zScore: 0.25, directionalZ: 0.25, isAnomaly: false },
        { domain: 'behavior', metric: 'completionRate', value: 0.1, zScore: -4, directionalZ: -4, isAnomaly: true },
        { domain: 'fine_motor', metric: 'questionnaireScore', value: 2, zScore: -3, directionalZ: -3, maxScore: 20, isAnomaly: true },
      ],
    }, '25-36m');
    // fine_motor 只反映問卷（drawing 不稀釋）
    expect(out.domainCategories?.fine_motor).toBe('refer');
    // behavior 不 gate（純顯示）
    expect(out.domainCategories?.behavior).toBeUndefined();
    expect(out.domainLevelZ?.behavior).toBeUndefined();
    // drawing detail 仍保留於 details（顯示用）
    expect(out.details?.some((d) => d.metric === 'drawingScore')).toBe(true);
  });
});

describe('recomputeTriageResult — per-domain gating (spec §7.2)', () => {
  it('refer when any domain composite z ≤ -2 SD', () => {
    // 白名單：only questionnaireScore gates. cognition z = -3 → refer
    const out = recomputeTriageResult({
      ...baseResult,
      details: [
        { domain: 'cognition', metric: 'questionnaireScore', value: 1, zScore: -3, directionalZ: -3, maxScore: 20, isAnomaly: true },
      ],
    }, '25-36m');
    expect(out.category).toBe('refer');
    expect(out.domainCategories?.cognition).toBe('refer');
    expect(out.domainLevelZ?.cognition).toBeLessThanOrEqual(-2);
    expect(out.summary).toContain('認知');
    expect(out.summary).toContain('專業人員進一步了解');
  });

  it('monitor when any domain composite z in (-2, -1]', () => {
    // 白名單：only questionnaireScore gates. 單個 domain z=-1 → monitor
    const out = recomputeTriageResult({
      ...baseResult,
      details: [
        // questionnaire without maxScore: recompute keeps directionalZ as-is
        { domain: 'cognition', metric: 'questionnaireScore', value: 10, zScore: -1, directionalZ: -1, maxScore: undefined, isAnomaly: true },
      ],
    }, '25-36m');
    expect(out.domainLevelZ?.cognition).toBeCloseTo(-1.0);
    expect(out.domainCategories?.cognition).toBe('monitor');
    expect(out.category).toBe('monitor');
    expect(out.summary).toContain('認知');
    expect(out.summary).toContain('還在發展中');
  });

  it('normal when all domains > -1 SD', () => {
    // 白名單：only questionnaireScore gates. 兩個 domain 都 z > -1 → normal
    const out = recomputeTriageResult({
      ...baseResult,
      details: [
        { domain: 'cognition', metric: 'questionnaireScore', value: 15, zScore: -0.3, directionalZ: -0.3, maxScore: 20, isAnomaly: false },
        { domain: 'fine_motor', metric: 'questionnaireScore', value: 16, zScore: 0, directionalZ: 0, maxScore: 20, isAnomaly: false },
      ],
    }, '25-36m');
    expect(out.category).toBe('normal');
    expect(out.domainCategories?.cognition).toBe('normal');
    expect(out.domainCategories?.fine_motor).toBe('normal');
    expect(out.summary).toContain('同齡常見範圍');
  });

  it('integration: v5 record with stale category gets refreshed end-to-end', () => {
    // v5 saved: triage thought it was "monitor" with anomalyCount=2.
    // After recompute under per-domain gating (whitelist): cognition questionnaireScore → refer,
    // fine_motor questionnaireScore → monitor, drawing is display-only (excluded from gating).
    const old: PersistedTriageResult = {
      category: 'monitor',
      confidence: 0.75,
      summary: '舊文案',
      anomalyCount: 2,
      details: [
        // questionnaire cognition — old format with no z, will be recomputed
        {
          domain: 'cognition',
          metric: 'questionnaireScore',
          value: 1, // 1/4 → old anomaly (below half)
          zScore: null,
          directionalZ: null,
          maxScore: 4,
          isAnomaly: true,
        },
        // questionnaire fine_motor — whitelist gating signal, no maxScore so directionalZ preserved
        {
          domain: 'fine_motor',
          metric: 'questionnaireScore',
          value: 8,
          zScore: -1.2,
          directionalZ: -1.2,
          maxScore: undefined,
          isAnomaly: true,
        },
        // drawing z-based — already had z in v5 but now display-only
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
    // fine_motor questionnaireScore z=-1.2 → monitor band (drawing excluded)
    expect(out.domainLevelZ?.fine_motor).toBeCloseTo(-1.2);
    expect(out.domainCategories?.fine_motor).toBe('monitor');
    // Overall = refer (any refer wins)
    expect(out.category).toBe('refer');
    // anomalyCount refreshed: cognition (-4.43) and fine_motor (-1.2) both ≤ -1 (drawing counted too)
    expect(out.anomalyCount).toBe(3);
    // Summary refreshed
    expect(out.summary).toContain('認知');
    expect(out.summary).not.toContain('舊文案');
  });
});

describe('recomputeTriageResult — drawing value=0 sanitization (v7)', () => {
  it('drops drawingScore detail with value=0 before recomputing domain z', () => {
    // 2026-05-28 bug: user "認真畫了圓圈卻被評為 0 分", drawing 進 fine_motor
    // domain 把問卷的 +0.67 SD 拉成 -1.04 SD，整體 monitor。修補後 drawing
    // value=0 視為「無有效資料」直接 drop，fine_motor 只剩問卷 z=+0.67 → normal。
    const out = recomputeTriageResult({
      category: 'monitor',
      confidence: 0.75,
      summary: '舊',
      details: [
        {
          domain: 'fine_motor',
          metric: 'drawingScore',
          value: 0,
          zScore: -2.75,
          directionalZ: -2.75,
          isAnomaly: true,
        },
        {
          domain: 'fine_motor',
          metric: 'questionnaireScore',
          value: 4,
          zScore: 0.67,
          directionalZ: 0.67,
          maxScore: 4,
          isAnomaly: false,
        },
      ],
    }, '61-72m');
    // drawing detail 應該被 drop
    const drawingDetail = out.details?.find(d => d.metric === 'drawingScore');
    expect(drawingDetail).toBeUndefined();
    // fine_motor 只剩問卷 z (重算後 still ≈ +0.67)
    expect(out.domainLevelZ?.fine_motor).toBeGreaterThan(0);
    expect(out.domainCategories?.fine_motor).toBe('normal');
    expect(out.category).toBe('normal');
  });

  it('keeps drawing detail when value > 0 (real low score, not bug)', () => {
    const out = recomputeTriageResult({
      category: 'monitor',
      confidence: 0.75,
      summary: '',
      details: [
        {
          domain: 'fine_motor',
          metric: 'drawingScore',
          value: 30,
          zScore: -1.25,
          directionalZ: -1.25,
          isAnomaly: true,
        },
      ],
    }, '61-72m');
    const drawingDetail = out.details?.find(d => d.metric === 'drawingScore');
    expect(drawingDetail).toBeDefined();
    expect(drawingDetail?.value).toBe(30);
  });

  it('returns safe default when all details are sanitized away', () => {
    const out = recomputeTriageResult({
      category: 'monitor',
      confidence: 0.75,
      summary: '舊',
      details: [
        {
          domain: 'fine_motor',
          metric: 'drawingScore',
          value: 0,
          zScore: -2.75,
          directionalZ: -2.75,
          isAnomaly: true,
        },
      ],
    }, '61-72m');
    expect(out.category).toBe('normal');
    expect(out.details).toEqual([]);
    expect(out.summary).toContain('資料不足');
  });
});

describe('recomputeTriageResult — confidence scaling', () => {
  it('refer confidence rises with affected domain count', () => {
    // 白名單：only questionnaireScore gates. 單個 domain refer
    const oneRefer = recomputeTriageResult({
      ...baseResult,
      details: [
        { domain: 'cognition', metric: 'questionnaireScore', value: 1, zScore: -5, directionalZ: -5, maxScore: 20, isAnomaly: true },
      ],
    }, '25-36m');
    // 白名單：two domains refer
    const twoRefer = recomputeTriageResult({
      ...baseResult,
      details: [
        { domain: 'cognition', metric: 'questionnaireScore', value: 1, zScore: -5, directionalZ: -5, maxScore: 20, isAnomaly: true },
        { domain: 'fine_motor', metric: 'questionnaireScore', value: 2, zScore: -3, directionalZ: -3, maxScore: 20, isAnomaly: true },
      ],
    }, '25-36m');
    expect(twoRefer.confidence).toBeGreaterThan(oneRefer.confidence);
    expect(twoRefer.confidence).toBeLessThanOrEqual(0.95);
  });

  it('normal baseline confidence = 0.85', () => {
    // 白名單：only questionnaireScore gates. normal category baseline confidence
    const out = recomputeTriageResult({
      ...baseResult,
      details: [
        { domain: 'cognition', metric: 'questionnaireScore', value: 15, zScore: 0, directionalZ: 0, maxScore: 20, isAnomaly: false },
      ],
    }, '25-36m');
    expect(out.category).toBe('normal');
    expect(out.confidence).toBe(0.85);
  });
});
