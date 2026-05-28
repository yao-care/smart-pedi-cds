import { describe, it, expect, vi } from 'vitest';
import { computeTriage, type TriageInput } from '../../src/engine/cdsa/triage';
import type { BehaviorMetrics } from '../../src/engine/cdsa/behavior-analysis';
import type { VoiceMetrics } from '../../src/engine/cdsa/voice-analysis';
import type { DrawingAnalysisResult } from '../../src/engine/cdsa/drawing-analysis';

function makeBehavior(overrides: Partial<BehaviorMetrics> = {}): BehaviorMetrics {
  return {
    responseTimeDistribution: { p50: 1500, p95: 3000, std: 500 },
    interactionRhythm: 0.5,
    operationConsistency: 0.75,
    retryCount: 1,
    interruptionPattern: 0.05,
    reactionLatency: 2000,
    completionRate: 0.8,
    ...overrides,
  };
}

function makeVoice(overrides: Partial<VoiceMetrics> = {}): VoiceMetrics {
  return {
    voiceDurationTotal: 10,
    pitchMean: 200,
    pitchStd: 30,
    energyMean: 0.5,
    energyStd: 0.1,
    mfccMean: [],
    silenceRatio: 0.2,
    voiceActivityCount: 5,
    ...overrides,
  };
}

function makeDrawing(overrides: Partial<DrawingAnalysisResult> = {}): DrawingAnalysisResult {
  return {
    overallScore: 60,
    // shapes presence is how triage tells "user actually drew" from "module
    // skipped" — a non-empty array means the drawing detail is eligible to
    // be pushed. Tests that want to exercise the "no drawing" branch should
    // explicitly pass `shapes: []` to override.
    shapes: [{
      shapeId: 'circle',
      closedness: 0.85,
      smoothness: 0.8,
      symmetry: 0.85,
      sizeConsistency: 0.9,
      strokeCount: 5,
      totalPoints: 60,
      drawingTime: 3500,
    }],
    strokeCount: 5,
    closure: 0.8,
    smoothness: 0.7,
    classification: 'typical',
    confidence: 0.85,
    maturityLevel: 'age_appropriate',
    ...overrides,
  };
}

const baseInput: TriageInput = {
  ageGroup: '25-36m',
  behavior: makeBehavior(),
  voice: makeVoice(),
  drawing: makeDrawing(),
};

describe('computeTriage', () => {
  it('returns normal when no metrics breach thresholds', async () => {
    const result = await computeTriage(baseInput);
    expect(result.category).toBe('normal');
    expect(result.anomalyCount).toBe(0);
    expect(result.summary).toContain('正常範圍');
  });

  it('returns monitor when a domain composite z lands in [-2, -1] (per-domain gating, spec §7.2)', async () => {
    // behavior domain has 4 z metrics. Two moderately low + two default → mean z in monitor band.
    // completionRate=0.30 (z=-3.0), operationConsistency=0.40 (z=-2.0), other 2 default (z=0) → mean ≈ -1.25.
    const result = await computeTriage({
      ...baseInput,
      behavior: makeBehavior({ completionRate: 0.30, operationConsistency: 0.40 }),
    });
    expect(result.category).toBe('monitor');
    expect(result.domainCategories?.behavior).toBe('monitor');
    expect(result.domainLevelZ?.behavior).toBeLessThanOrEqual(-1);
    expect(result.domainLevelZ?.behavior).toBeGreaterThan(-2);
  });

  it('returns refer when ANY domain composite z ≤ -2 SD (spec §7.2)', async () => {
    // behavior 3 severe + drawing severe → both domains push below -2 SD composite.
    const result = await computeTriage({
      ...baseInput,
      behavior: makeBehavior({
        completionRate: 0.1,
        operationConsistency: 0.2,
        reactionLatency: 8000,
      }),
      drawing: makeDrawing({ overallScore: 10 }),
    });
    expect(result.category).toBe('refer');
    expect(result.domainCategories?.behavior).toBe('refer');
    expect(result.domainCategories?.fine_motor).toBe('refer');
    expect(result.summary).toContain('專業評估');
  });

  it('escalates to refer when severe anomalies cluster in same domain (NEW: per-domain composite, not per-metric count)', async () => {
    // OLD gating: 3 anomalies but 1 domain → monitor (dual-axis dampener).
    // NEW gating: behavior composite z = mean(-4.33, -3.33, -7.5, 0) ≈ -3.79 → refer.
    // This is the intended behaviour shift in spec §7.2 (2026-05-28 rev).
    const result = await computeTriage({
      ...baseInput,
      behavior: makeBehavior({
        completionRate: 0.1,
        operationConsistency: 0.2,
        reactionLatency: 8000,
      }),
    });
    expect(result.category).toBe('refer');
    expect(result.domainCategories?.behavior).toBe('refer');
  });

  it('honours questionnaireMaxScores when provided (z-based ASQ-3 norm)', async () => {
    // cognition: score=8 over maxScore=20 in 25-36m. ASQ-3 Problem Solving @ 30m: mean=53.54, sd=8.70.
    // Scaled to maxScore=20: mean=17.85, sd=2.90 → z=(8-17.85)/2.90 ≈ -3.40 → isAnomaly (z ≤ -1).
    const result = await computeTriage({
      ...baseInput,
      questionnaireScores: { cognition: 8 },
      questionnaireMaxScores: { cognition: 20 },
    });
    const cog = result.details.find((d) => d.metric === 'questionnaireScore');
    expect(cog).toBeDefined();
    expect(cog?.isAnomaly).toBe(true);
    expect(cog?.directionalZ).toBeLessThan(-2);
  });

  it('skips questionnaire detail when maxScore missing (no unsafe fallback)', async () => {
    // OLD behaviour: silently used maxScore=10 fallback (wrong scaling under new norms).
    // NEW behaviour: skip the detail rather than mis-scale.
    const result = await computeTriage({
      ...baseInput,
      questionnaireScores: { cognition: 8 },
    });
    const cog = result.details.find((d) => d.metric === 'questionnaireScore');
    expect(cog).toBeUndefined();
  });

  it('confidence rises with more anomalies', async () => {
    const normalResult = await computeTriage(baseInput);
    const referResult = await computeTriage({
      ...baseInput,
      behavior: makeBehavior({
        completionRate: 0.1,
        operationConsistency: 0.2,
        reactionLatency: 8000,
      }),
      drawing: makeDrawing({ overallScore: 5 }),
    });
    expect(referResult.confidence).toBeGreaterThan(normalResult.confidence);
  });

  it('includes drawing detail in result', async () => {
    const result = await computeTriage(baseInput);
    const drawingDetail = result.details.find((d) => d.metric === 'drawingScore');
    expect(drawingDetail).toBeDefined();
    expect(drawingDetail?.value).toBe(60);
  });

  it('skips drawing detail when shapes is empty (user did not draw)', async () => {
    // Scenario from 2026-05-28 bug report: adult tested without actually
    // drawing in the drawing module. analyzeDrawing returns overallScore=0
    // for empty input which, without this guard, would feed z=-2.75 into
    // fine_motor and synthesise a "monitor" diagnosis out of no data.
    const result = await computeTriage({
      ...baseInput,
      drawing: makeDrawing({ overallScore: 0, shapes: [] }),
    });
    const drawingDetail = result.details.find((d) => d.metric === 'drawingScore');
    expect(drawingDetail).toBeUndefined();
  });

  it('skips voice metrics when voiceDurationTotal is 0', async () => {
    const result = await computeTriage({
      ...baseInput,
      voice: makeVoice({ voiceDurationTotal: 0 }),
    });
    expect(result.details.find((d) => d.metric === 'voiceDuration')).toBeUndefined();
  });

  it('flags gross_motor anomaly when classification === delayed', async () => {
    const result = await computeTriage({
      ...baseInput,
      grossMotor: { classification: 'delayed', confidence: 0.9, features: {} },
    });
    const gmDetail = result.details.find((d) => d.domain === 'gross_motor');
    expect(gmDetail?.isAnomaly).toBe(true);
  });

  it('directionalZ is negative when reactionLatency is high (worse than norm)', async () => {
    const result = await computeTriage({
      ...baseInput,
      behavior: makeBehavior({ reactionLatency: 6000 }), // far above mean 2000
    });
    const detail = result.details.find((d) => d.metric === 'reactionLatency');
    expect(detail).toBeDefined();
    expect(detail?.zScore).toBeGreaterThan(0); // raw z positive (high)
    expect(detail?.directionalZ).toBeLessThan(0); // directionalZ flipped: negative = worse
  });

  it('directionalZ matches zScore for non-reversed metrics (drawingScore)', async () => {
    const result = await computeTriage({
      ...baseInput,
      drawing: makeDrawing({ overallScore: 10 }), // far below mean 55
    });
    const detail = result.details.find((d) => d.metric === 'drawingScore');
    expect(detail?.zScore).toBeLessThan(0);
    expect(detail?.directionalZ).toBe(detail?.zScore); // same sign
  });

  it('questionnaire detail now exposes z-score (after ASQ-3 norm integration; spec §7.2 2026-05-28 rev)', async () => {
    // OLD behaviour: questionnaire had no norms → directionalZ was null.
    // NEW behaviour: ASQ-3 borrow → directionalZ is a real z-score.
    const result = await computeTriage({
      ...baseInput,
      questionnaireScores: { cognition: 3 },
      questionnaireMaxScores: { cognition: 4 },
    });
    const detail = result.details.find((d) => d.metric === 'questionnaireScore');
    expect(detail).toBeDefined();
    expect(typeof detail?.directionalZ).toBe('number');
    expect(detail?.zScore).not.toBeNull();
    expect(detail?.normMean).toBeGreaterThan(0);
    expect(detail?.normStd).toBeGreaterThan(0);
  });

  it('questionnaire isAnomaly mirrors z ≤ -1 SD per-detail UI 提示 threshold (NOT score<50% anymore)', async () => {
    // ASQ-3 Problem Solving @ 30m: mean=53.54, sd=8.70. Scaled to maxScore=4:
    //   mean ≈ 3.57, sd ≈ 0.58.
    //   score=3 → z=(3-3.57)/0.58 ≈ -0.98 (just above -1) → isAnomaly=false (borderline).
    //   score=1 → z ≈ -4.43 → isAnomaly=true (severe).
    // Similarly for language_comprehension (ASQ-3 Communication @ 30m).
    const result = await computeTriage({
      ...baseInput,
      questionnaireScores: { cognition: 1, language_comprehension: 4 },
      questionnaireMaxScores: { cognition: 4, language_comprehension: 4 },
    });
    const cogDetail = result.details.find((d) => d.domain === 'cognition' && d.metric === 'questionnaireScore');
    expect(cogDetail?.isAnomaly).toBe(true);
    const langDetail = result.details.find((d) => d.domain === 'language_comprehension' && d.metric === 'questionnaireScore');
    expect(langDetail?.isAnomaly).toBe(false); // full score → z ≈ 0 → normal
  });
});

describe('triage dev-mode warnings', () => {
  it('warns on unknown questionnaire domain', async () => {
    vi.stubEnv('DEV', true);
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await computeTriage({
      ...baseInput,
      questionnaireScores: { unknown_domain: 5 },
      questionnaireMaxScores: { unknown_domain: 10 },
    });
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('Unknown questionnaire domain'));
    spy.mockRestore();
    vi.unstubAllEnvs();
  });

  it('warns when questionnaireScores has no questionnaireMaxScores', async () => {
    vi.stubEnv('DEV', true);
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await computeTriage({
      ...baseInput,
      questionnaireScores: { cognition: 3 },
    });
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('without questionnaireMaxScores'));
    spy.mockRestore();
    vi.unstubAllEnvs();
  });

  it('does not warn in prod (DEV=false)', async () => {
    vi.stubEnv('DEV', false);
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await computeTriage({
      ...baseInput,
      questionnaireScores: { unknown_domain: 5 },
    });
    expect(spy).not.toHaveBeenCalledWith(expect.stringContaining('Unknown'));
    spy.mockRestore();
    vi.unstubAllEnvs();
  });
});
