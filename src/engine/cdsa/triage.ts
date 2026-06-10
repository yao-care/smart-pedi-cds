import type { BehaviorMetrics } from './behavior-analysis';
import type { VoiceMetrics } from './voice-analysis';
import type { DrawingAnalysisResult } from './drawing-analysis';
import type { AgeGroupCDSA } from '../../lib/utils/age-groups';
import { db } from '../../lib/db/schema';
import {
  getQuestionnaireNorm,
  type QuestionnaireDomain,
} from '../../lib/baselines/questionnaire-norms';
import {
  PER_DETAIL_ANOMALY_Z,
  DOMAIN_REFER_Z,
  DOMAIN_MONITOR_Z,
  TRIAGE_DOMAIN_LABELS,
} from './triage-constants';

// Re-export for callers that already import constants from triage.ts.
// (recompute-triage imports straight from triage-constants to avoid the
// db ↔ triage circular import path when used inside schema.ts v6 upgrade tx.)
export {
  PER_DETAIL_ANOMALY_Z,
  DOMAIN_REFER_Z,
  DOMAIN_MONITOR_Z,
  TRIAGE_DOMAIN_LABELS,
};

const KNOWN_QUESTIONNAIRE_DOMAINS = new Set<QuestionnaireDomain>([
  'cognition', 'fine_motor', 'gross_motor',
  'language_comprehension', 'language_expression', 'social_emotional',
]);

function isQuestionnaireDomain(d: string): d is QuestionnaireDomain {
  return KNOWN_QUESTIONNAIRE_DOMAINS.has(d as QuestionnaireDomain);
}

export interface TriageInput {
  ageGroup: AgeGroupCDSA;
  behavior: BehaviorMetrics;
  voice: VoiceMetrics;
  drawing: DrawingAnalysisResult;
  questionnaireScores?: Record<string, number>; // domain -> score
  /** Domain → maximum possible score in the questionnaire (questions × 2).
   *  When absent the engine falls back to a conservative 10/domain default
   *  but the radar's normalisation may be inaccurate. */
  questionnaireMaxScores?: Record<string, number>;
  grossMotor?: { classification: string; confidence: number; features: Record<string, number> };
}

export interface TriageResult {
  category: 'normal' | 'monitor' | 'refer';
  confidence: number;
  summary: string;
  anomalyCount: number;
  details: Array<{
    domain: string;
    metric: string;
    value: number;
    zScore: number | null;
    /** Direction-normalised z-score. Negative = worse than norm, positive = better.
     *  Differs from `zScore` because some metrics (reactionLatency, interactionRhythm)
     *  are "higher is worse" — we flip their sign so the radar / summary code can
     *  treat all metrics uniformly. null when zScore is null (e.g. questionnaire).
     */
    directionalZ: number | null;
    /** Norm mean/std this metric was scored against (null for non-z metrics).
     *  Exposed so the physician detail view can show what the value was
     *  compared to without re-loading norms client-side. */
    normMean?: number | null;
    normStd?: number | null;
    /** Per-metric maximum used to compute isAnomaly for questionnaire rows
     *  (null for z-based metrics). */
    maxScore?: number | null;
    /** UI-only 提示性 anomaly mark (directionalZ ≤ -1 SD). Spec §7.2 (2026-05-28 rev):
     *  does NOT participate in gating; gating uses per-domain composite z. */
    isAnomaly: boolean;
  }>;
  /** Per-domain composite z (mean of all details' directionalZ in that domain).
   *  Drives the per-domain gating (spec §7.2 2026-05-28 rev). Optional for
   *  backward compat with older persisted TriageResult records. */
  domainLevelZ?: Record<string, number>;
  /** Per-domain classification by domain-level z. Same gating thresholds as
   *  TriageResult.category but at domain granularity (so the UI can mark
   *  individual domains, not only the overall result). */
  domainCategories?: Record<string, 'normal' | 'monitor' | 'refer'>;
}

/** Load norms from DB, fall back to hardcoded defaults */
async function loadNorms(ageGroup: AgeGroupCDSA): Promise<Record<string, { mean: number; std: number }>> {
  const defaults: Record<string, { mean: number; std: number }> = {
    'completionRate': { mean: 0.75, std: 0.15 },
    'operationConsistency': { mean: 0.70, std: 0.15 },
    'reactionLatency': { mean: 2000, std: 800 },
    'interactionRhythm': { mean: 0.5, std: 0.2 },
    'drawingScore': { mean: 55, std: 20 },
    'voiceDuration': { mean: 8, std: 4 },
  };

  try {
    const dbNorms = await db.normThresholds
      .where('ageGroup')
      .equals(ageGroup)
      .toArray();

    if (dbNorms.length > 0) {
      const result = { ...defaults };
      for (const norm of dbNorms) {
        result[norm.metric] = { mean: norm.mean, std: norm.std };
      }
      return result;
    }
  } catch {
    // DB not available, use defaults
  }

  return defaults;
}

function zScore(value: number, mean: number, std: number): number {
  if (std === 0) return 0;
  return (value - mean) / std;
}

export async function computeTriage(input: TriageInput): Promise<TriageResult> {
  const NORMS = await loadNorms(input.ageGroup);
  const details: TriageResult['details'] = [];

  // Behavior metrics
  const behaviorMetrics = [
    { domain: 'behavior', metric: 'completionRate', value: input.behavior.completionRate },
    { domain: 'behavior', metric: 'operationConsistency', value: input.behavior.operationConsistency },
    { domain: 'behavior', metric: 'reactionLatency', value: input.behavior.reactionLatency },
    { domain: 'behavior', metric: 'interactionRhythm', value: input.behavior.interactionRhythm },
  ];

  for (const m of behaviorMetrics) {
    const norm = NORMS[m.metric];
    if (!norm) continue;
    const z = zScore(m.value, norm.mean, norm.std);
    // For latency and rhythm, higher is worse (reverse direction)
    const isReversed = m.metric === 'reactionLatency' || m.metric === 'interactionRhythm';
    const directionalZ = isReversed ? -z : z; // negative = worse than norm; uniform across metrics
    details.push({
      domain: m.domain,
      metric: m.metric,
      value: m.value,
      zScore: z,
      directionalZ,
      normMean: norm.mean,
      normStd: norm.std,
      isAnomaly: directionalZ <= PER_DETAIL_ANOMALY_Z, // UI 提示用，不參與 gating
    });
  }

  // Drawing — guard against "module skipped without drawing" producing
  // overallScore=0 (drawing-analysis.ts:173-175 fallback) which the
  // ASQ-3-style norm would then read as z=-2.75 (severe delay) and drag
  // fine_motor domain into refer/monitor band even though there is no
  // actual data. Mirror the `voiceDurationTotal > 0` guard at line ~164.
  // Empty shapes[] == user never drew anything; we drop the detail rather
  // than synthesising "0/100" out of no-input.
  const hasDrawingData = (input.drawing.shapes?.length ?? 0) > 0;
  if (hasDrawingData) {
    const drawingNorm = NORMS['drawingScore'];
    const drawingZ = zScore(input.drawing.overallScore, drawingNorm.mean, drawingNorm.std);
    details.push({
      domain: 'fine_motor',
      metric: 'drawingScore',
      value: input.drawing.overallScore,
      zScore: drawingZ,
      directionalZ: drawingZ,
      normMean: drawingNorm.mean,
      normStd: drawingNorm.std,
      isAnomaly: drawingZ <= PER_DETAIL_ANOMALY_Z,
    });
  }

  // Voice
  if (input.voice.voiceDurationTotal > 0) {
    const voiceNorm = NORMS['voiceDuration'];
    const voiceZ = zScore(input.voice.voiceDurationTotal, voiceNorm.mean, voiceNorm.std);
    details.push({
      domain: 'language',
      metric: 'voiceDuration',
      value: input.voice.voiceDurationTotal,
      zScore: voiceZ,
      directionalZ: voiceZ,
      normMean: voiceNorm.mean,
      normStd: voiceNorm.std,
      isAnomaly: voiceZ <= PER_DETAIL_ANOMALY_Z,
    });
  }

  // Questionnaire scores (if available) — z-based per spec §7.2 (2026-05-28)
  // Each domain × ageGroup borrows ASQ-3 Table 18 mean/SD via questionnaire-norms.ts,
  // scaled by maxScore_local / 60. Per-detail isAnomaly is UI 提示 (z ≤ -1 SD); the
  // gating that produces the refer/monitor/normal category lives in the per-domain
  // composition further down.
  if (input.questionnaireScores && import.meta.env?.DEV) {
    for (const domain of Object.keys(input.questionnaireScores)) {
      if (!isQuestionnaireDomain(domain)) {
        console.warn(`[triage] Unknown questionnaire domain: ${domain}`);
      }
    }
    if (!input.questionnaireMaxScores) {
      console.warn('[triage] questionnaireScores provided without questionnaireMaxScores');
    }
  }
  if (input.questionnaireScores) {
    for (const [domain, score] of Object.entries(input.questionnaireScores)) {
      if (!isQuestionnaireDomain(domain)) continue; // skip unknown defensively
      const maxScore = input.questionnaireMaxScores?.[domain];
      if (!maxScore || maxScore <= 0) {
        // Without a valid maxScore we can't scale the ASQ-3 norm; skip rather than
        // fall back to 10 (which would silently mis-scale z). The store path always
        // provides maxScores; assessment-analyzer now also provides them.
        if (import.meta.env?.DEV) {
          console.warn(`[triage] questionnaire ${domain}: missing/invalid maxScore, skip`);
        }
        continue;
      }
      try {
        const norm = getQuestionnaireNorm(domain, input.ageGroup, maxScore);
        const z = (score - norm.mean) / norm.sd;
        details.push({
          domain,
          metric: 'questionnaireScore',
          value: score,
          zScore: z,
          directionalZ: z, // 負 = 比常模差，與 drawing/voice 一致
          normMean: norm.mean,
          normStd: norm.sd,
          maxScore,
          isAnomaly: z <= PER_DETAIL_ANOMALY_Z,
        });
      } catch (err) {
        // Norm lookup failed (should not happen if questionnaire-norms完整性測試 passes).
        // Per §7.4 fallback B (灰格), we skip the detail here and rely on UI to draw
        // a 「資料不足」 grey cell. UI integration is left to Phase 4.
        if (import.meta.env?.DEV) {
          console.warn('[triage] norm lookup failed for %s::%s', domain, input.ageGroup, err);
        }
      }
    }
  }

  // Gross motor (from MediaPipe Pose analysis).
  // Map categorical classification → directionalZ so it participates in
  // per-domain gating uniformly with other metrics. 'delayed' → -2 SD strong
  // signal; 'normal' → 0; absent → no push.
  if (input.grossMotor) {
    let poseDirectionalZ: number | null = null;
    if (input.grossMotor.classification === 'delayed') poseDirectionalZ = -2;
    else if (input.grossMotor.classification === 'normal') poseDirectionalZ = 0;
    if (poseDirectionalZ !== null) {
      details.push({
        domain: 'gross_motor',
        metric: 'poseClassification',
        value: input.grossMotor.confidence,
        zScore: poseDirectionalZ,
        directionalZ: poseDirectionalZ,
        isAnomaly: poseDirectionalZ <= PER_DETAIL_ANOMALY_Z,
      });
    }
  }

  // Triage decision (per spec §7.2 2026-05-28 rev — per-domain z composition).
  //
  // Why per-domain not per-metric: this system has 12+ metrics across 7 radar
  // domains (behavior alone has 4 z metrics: completionRate / operationConsistency /
  // reactionLatency / interactionRhythm). Applying ASQ-3 cutoffs (-1/-2 SD) per
  // metric would amplify false positives in domains with multiple metrics. Industry
  // multi-area screeners (ASQ-3 / Bayley / Battelle / DAYC-2) all judge per-area:
  // metrics within an area compose into a single area score, cutoff applies at
  // area total. Composing directionalZ per domain (mean) restores that property.
  //
  // The per-detail isAnomaly above remains as a UI 提示 ("which metrics drove the
  // domain low?") but does NOT participate in this gating.
  const domainZs: Record<string, number[]> = {};
  for (const d of details) {
    if (d.directionalZ !== null && d.directionalZ !== undefined) {
      if (!domainZs[d.domain]) domainZs[d.domain] = [];
      domainZs[d.domain].push(d.directionalZ);
    }
  }
  const domainLevelZ: Record<string, number> = {};
  for (const [domain, zs] of Object.entries(domainZs)) {
    domainLevelZ[domain] = zs.reduce((a, b) => a + b, 0) / zs.length;
  }
  const domainCategories: Record<string, 'normal' | 'monitor' | 'refer'> = {};
  for (const [domain, z] of Object.entries(domainLevelZ)) {
    if (z <= DOMAIN_REFER_Z) domainCategories[domain] = 'refer';
    else if (z <= DOMAIN_MONITOR_Z) domainCategories[domain] = 'monitor';
    else domainCategories[domain] = 'normal';
  }

  const referDomains = Object.entries(domainCategories).filter(([_, c]) => c === 'refer').map(([d]) => d);
  const monitorDomains = Object.entries(domainCategories).filter(([_, c]) => c === 'monitor').map(([d]) => d);

  // Confidence rationale (per spec §7.2 2026-05-28 rev):
  //   - normal baseline 0.85 (clearest signal: nothing breaches even -1 SD).
  //   - monitor 0.65 + 0.1·monitorDomains (cap 0.90): "in-between" zone is the
  //     least certain band by design — closer to the cutoff = lower confidence.
  //   - refer 0.85 + 0.03·refer + 0.02·monitor (cap 0.95): more affected domains
  //     = stronger signal; always > normal baseline since refer should never read
  //     "less sure than normal".
  let category: TriageResult['category'];
  let confidence: number;
  if (referDomains.length > 0) {
    category = 'refer';
    confidence = Math.min(0.95, 0.85 + 0.03 * referDomains.length + 0.02 * monitorDomains.length);
  } else if (monitorDomains.length > 0) {
    category = 'monitor';
    confidence = Math.min(0.90, 0.65 + 0.1 * monitorDomains.length);
  } else {
    category = 'normal';
    confidence = 0.85;
  }

  // anomalyCount retained for backward compat with persisted records / UI that
  // still reads it; now reflects per-detail UI 提示 count (not gating-relevant).
  const anomalyCount = details.filter((d) => d.isAnomaly).length;

  // Summary — translate domain ids to user-facing Chinese labels (see
  // module-level TRIAGE_DOMAIN_LABELS export).
  const labelDomains = (ds: string[]) => ds.map(d => TRIAGE_DOMAIN_LABELS[d] ?? d).join('、');
  const summary =
    category === 'normal' ? '各面向發展在正常範圍內。' :
    category === 'monitor' ? `${labelDomains(monitorDomains)}面向有待觀察。建議持續追蹤。` :
    `${labelDomains(referDomains)}面向顯示異常。建議進一步專業評估。`;

  return {
    category,
    confidence,
    summary,
    anomalyCount,
    details,
    domainLevelZ,
    domainCategories,
  };
}
