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
    expect(result.summary).toContain('同齡常見範圍');
  });

  it('returns monitor when a domain composite z lands in [-2, -1] (per-domain gating, spec §7.2)', async () => {
    // Per-domain gating now driven by questionnaire only. cognition score 11/20 in 25-36m
    // gives a composite z in monitor band per ASQ-3 norm.
    const result = await computeTriage({
      ...baseInput,
      questionnaireScores: { cognition: 11 },
      questionnaireMaxScores: { cognition: 20 },
    });
    expect(result.category).toBe('monitor');
    expect(result.domainCategories?.cognition).toBe('monitor');
    expect(result.domainLevelZ?.cognition).toBeLessThanOrEqual(-1);
    expect(result.domainLevelZ?.cognition).toBeGreaterThan(-2);
  });

  it('returns refer when ANY domain composite z ≤ -2 SD (spec §7.2)', async () => {
    // Per-domain gating driven by questionnaire. cognition + fine_motor both refer
    // (low scores) → overall refer category. behavior/drawing are now display-only.
    const result = await computeTriage({
      ...baseInput,
      questionnaireScores: { cognition: 2, fine_motor: 2 },
      questionnaireMaxScores: { cognition: 20, fine_motor: 20 },
    });
    expect(result.category).toBe('refer');
    expect(result.domainCategories?.cognition).toBe('refer');
    expect(result.domainCategories?.fine_motor).toBe('refer');
    expect(result.summary).toContain('專業人員進一步了解');
  });

  it('escalates to refer when severe anomalies cluster in same domain (NEW: per-domain composite, not per-metric count)', async () => {
    // Per-domain gating: cognition low score (z ≤ -2) → refer.
    // This demonstrates per-domain composite logic: domain z is mean of its
    // questionnaire details, applied with ASQ-3 cutoffs.
    const result = await computeTriage({
      ...baseInput,
      questionnaireScores: { cognition: 2 },
      questionnaireMaxScores: { cognition: 20 },
    });
    expect(result.category).toBe('refer');
    expect(result.domainCategories?.cognition).toBe('refer');
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
      questionnaireScores: { cognition: 2, fine_motor: 2, language_expression: 3 },
      questionnaireMaxScores: { cognition: 20, fine_motor: 20, language_expression: 20 },
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

  it('voice detail carries the language_expression domain (not a standalone "language")', async () => {
    // 語音時長併入「語言表達」面向顯示，消除雷達上與問卷 language_comprehension/
    // language_expression 並存的孤立「語言」重複格（報告矛盾的根因）。
    const result = await computeTriage({ ...baseInput, voice: makeVoice({ voiceDurationTotal: 10 }) });
    const voice = result.details.find((d) => d.metric === 'voiceDuration');
    expect(voice?.domain).toBe('language_expression');
    // 不得再出現舊的綜合 'language' domain（那正是重複來源）。
    expect(result.details.some((d) => d.domain === 'language')).toBe(false);
  });

  it('keeps voice detail for display but excludes it from language_expression gating (display-only, 同 pose B1)', async () => {
    // 語音時長是感測 proxy（非 ASQ-3 常模背書），比照 pose 做 display-only：
    // 仍入 details 供顯示，但不參與 per-domain gating。此處無問卷 language_expression，
    // voice 是唯一訊號 → 該面向不應被 gate。
    const result = await computeTriage({ ...baseInput, voice: makeVoice({ voiceDurationTotal: 10 }) });
    expect(result.details.find((d) => d.metric === 'voiceDuration')).toBeDefined(); // still shown
    expect(result.domainLevelZ?.language_expression).toBeUndefined();
    expect(result.domainCategories?.language_expression).toBeUndefined();
  });

  it('voice "normal" does NOT dilute a questionnaire language_expression refer signal', async () => {
    // 稀釋回歸測試：正常語音時長（z≈正）與問卷 refer 訊號同桶平均，先前會把
    // language_expression composite 拉回 monitor/normal。display-only 修正之。
    const withVoice = await computeTriage({
      ...baseInput,
      voice: makeVoice({ voiceDurationTotal: 10 }),
      questionnaireScores: { language_expression: 2 },
      questionnaireMaxScores: { language_expression: 20 },
    });
    const withoutVoice = await computeTriage({
      ...baseInput,
      voice: makeVoice({ voiceDurationTotal: 0 }),
      questionnaireScores: { language_expression: 2 },
      questionnaireMaxScores: { language_expression: 20 },
    });
    expect(withoutVoice.domainCategories?.language_expression).toBe('refer');
    expect(withVoice.domainCategories?.language_expression).toBe('refer');
    expect(withVoice.domainLevelZ?.language_expression).toBeCloseTo(
      withoutVoice.domainLevelZ!.language_expression,
      10,
    );
  });

  describe('computeTriage — gating whitelist (drawing/behavior display-only)', () => {
    it('drawing "normal" does NOT dilute a questionnaire fine_motor refer signal', async () => {
      const withDrawing = await computeTriage({
        ...baseInput,
        drawing: makeDrawing({ overallScore: 60 }), // z≈+0.25（正常）
        questionnaireScores: { fine_motor: 2 },
        questionnaireMaxScores: { fine_motor: 20 },
      });
      const withoutDrawing = await computeTriage({
        ...baseInput,
        drawing: makeDrawing({ shapes: [] }), // 無 drawing detail
        questionnaireScores: { fine_motor: 2 },
        questionnaireMaxScores: { fine_motor: 20 },
      });
      expect(withoutDrawing.domainCategories?.fine_motor).toBe('refer');
      expect(withDrawing.domainCategories?.fine_motor).toBe('refer');
      expect(withDrawing.domainLevelZ?.fine_motor).toBeCloseTo(
        withoutDrawing.domainLevelZ!.fine_motor, 10,
      );
    });

    it('behavior game metrics do NOT produce per-domain gating (display-only)', async () => {
      const result = await computeTriage({
        ...baseInput,
        behavior: makeBehavior({
          completionRate: 0.1, operationConsistency: 0.1,
          reactionLatency: 8000, interactionRhythm: 0.05,
        }), // 極差
      });
      expect(result.domainCategories?.behavior).toBeUndefined();
      expect(result.domainLevelZ?.behavior).toBeUndefined();
    });

    it('gating reflects ONLY questionnaire domains (whitelist)', async () => {
      // baseInput 帶 behavior + drawing + voice；只有問卷 cognition 應進 gating。
      const result = await computeTriage({
        ...baseInput,
        questionnaireScores: { cognition: 18 },
        questionnaireMaxScores: { cognition: 20 },
      });
      expect(Object.keys(result.domainCategories ?? {})).toEqual(['cognition']);
    });
  });

  it('flags gross_motor anomaly when classification === delayed', async () => {
    const result = await computeTriage({
      ...baseInput,
      grossMotor: { classification: 'delayed', confidence: 0.9, features: {} },
    });
    const gmDetail = result.details.find((d) => d.domain === 'gross_motor');
    expect(gmDetail?.isAnomaly).toBe(true);
  });

  it('keeps pose detail for display but excludes it from gross_motor gating (B1: display-only)', async () => {
    // The pose classifier is a placeholder heuristic (not a clinical model),
    // so it must be display-only: its detail is still surfaced for the
    // physician view, but it does NOT participate in per-domain gating.
    const result = await computeTriage({
      ...baseInput,
      grossMotor: { classification: 'delayed', confidence: 0.9, features: {} },
    });
    const pose = result.details.find((d) => d.metric === 'poseClassification');
    expect(pose).toBeDefined(); // still shown
    // No questionnaire gross_motor here → pose is the only gross_motor signal,
    // and since it is display-only the domain must not be gated at all.
    expect(result.domainLevelZ?.gross_motor).toBeUndefined();
    expect(result.domainCategories?.gross_motor).toBeUndefined();
  });

  it('pose "normal" does NOT dilute a questionnaire gross_motor refer signal (B1)', async () => {
    // Regression for the followup B1 dilution bug: a placeholder pose 'normal'
    // (z=0) averaged with a strong questionnaire refer signal previously pulled
    // the gross_motor composite up toward monitor/normal. Display-only fixes it.
    const withPose = await computeTriage({
      ...baseInput,
      questionnaireScores: { gross_motor: 2 },
      questionnaireMaxScores: { gross_motor: 20 },
      grossMotor: { classification: 'normal', confidence: 0.9, features: {} },
    });
    const withoutPose = await computeTriage({
      ...baseInput,
      questionnaireScores: { gross_motor: 2 },
      questionnaireMaxScores: { gross_motor: 20 },
    });
    // Questionnaire score 2/20 is a severe delay (z ≤ -2 → refer).
    expect(withoutPose.domainCategories?.gross_motor).toBe('refer');
    // Adding a placeholder pose 'normal' must NOT change the gating outcome.
    expect(withPose.domainCategories?.gross_motor).toBe('refer');
    expect(withPose.domainLevelZ?.gross_motor).toBeCloseTo(
      withoutPose.domainLevelZ!.gross_motor,
      10,
    );
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

describe('computeTriage — red flags (age-band safety net)', () => {
  it('a milestone red flag forces refer regardless of normal domain averages', async () => {
    // baseInput 為 25-36m。gm-03（走路）答 0 → not-walking 紅旗，即使 gross_motor
    // domain 總分正常，仍強制 refer（不受平均稀釋）。
    const result = await computeTriage({
      ...baseInput,
      questionnaireScores: { gross_motor: 8 },
      questionnaireMaxScores: { gross_motor: 10 },
      questionnaireAnswers: { 'gm-03': 0 },
    });
    expect(result.redFlags?.map((f) => f.id)).toContain('not-walking');
    expect(result.category).toBe('refer');
    expect(result.summary).toContain('發展警訊');
  });

  it('no red flags when milestones are met', async () => {
    const result = await computeTriage({ ...baseInput, questionnaireAnswers: { 'gm-03': 2 } });
    expect(result.redFlags ?? []).toEqual([]);
  });

  it('red flags absent when no per-question answers provided', async () => {
    const result = await computeTriage(baseInput);
    expect(result.redFlags ?? []).toEqual([]);
  });
});
