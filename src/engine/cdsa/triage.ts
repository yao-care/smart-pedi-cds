import type { BehaviorMetrics } from './behavior-analysis';
import type { VoiceMetrics } from './voice-analysis';
import type { DrawingAnalysisResult } from './drawing-analysis';
import type { AgeGroupCDSA } from '../../lib/utils/age-groups';

export interface TriageInput {
  ageGroup: AgeGroupCDSA;
  behavior: BehaviorMetrics;
  voice: VoiceMetrics;
  drawing: DrawingAnalysisResult;
  questionnaireScores?: Record<string, number>; // domain -> score
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
    isAnomaly: boolean;
  }>;
}

// Simplified norms (would come from NormThreshold DB in production)
const NORMS: Record<string, { mean: number; std: number }> = {
  'completionRate': { mean: 0.75, std: 0.15 },
  'operationConsistency': { mean: 0.70, std: 0.15 },
  'reactionLatency': { mean: 2000, std: 800 },
  'interactionRhythm': { mean: 0.5, std: 0.2 },
  'drawingScore': { mean: 55, std: 20 },
  'voiceDuration': { mean: 8, std: 4 },
};

function zScore(value: number, mean: number, std: number): number {
  if (std === 0) return 0;
  return (value - mean) / std;
}

export function computeTriage(input: TriageInput): TriageResult {
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
    const effectiveZ = isReversed ? z : -z; // negative z = worse
    details.push({
      domain: m.domain,
      metric: m.metric,
      value: m.value,
      zScore: z,
      isAnomaly: effectiveZ >= 1.5, // 1.5 SD worse than mean
    });
  }

  // Drawing
  const drawingNorm = NORMS['drawingScore'];
  const drawingZ = zScore(input.drawing.overallScore, drawingNorm.mean, drawingNorm.std);
  details.push({
    domain: 'fine_motor',
    metric: 'drawingScore',
    value: input.drawing.overallScore,
    zScore: drawingZ,
    isAnomaly: drawingZ <= -1.5,
  });

  // Voice
  if (input.voice.voiceDurationTotal > 0) {
    const voiceNorm = NORMS['voiceDuration'];
    const voiceZ = zScore(input.voice.voiceDurationTotal, voiceNorm.mean, voiceNorm.std);
    details.push({
      domain: 'language',
      metric: 'voiceDuration',
      value: input.voice.voiceDurationTotal,
      zScore: voiceZ,
      isAnomaly: voiceZ <= -1.5,
    });
  }

  // Questionnaire scores (if available)
  if (input.questionnaireScores) {
    for (const [domain, score] of Object.entries(input.questionnaireScores)) {
      // Simple threshold: score < 50% of max is anomaly
      const maxScore = 10; // rough estimate
      const normalized = score / maxScore;
      details.push({
        domain,
        metric: 'questionnaireScore',
        value: score,
        zScore: null,
        isAnomaly: normalized < 0.5,
      });
    }
  }

  // Gross motor (from MediaPipe Pose analysis)
  if (input.grossMotor && input.grossMotor.classification === 'delayed') {
    details.push({
      domain: 'gross_motor',
      metric: 'poseClassification',
      value: input.grossMotor.confidence,
      zScore: null,
      isAnomaly: true,
    });
  }

  // Triage decision
  const anomalyCount = details.filter(d => d.isAnomaly).length;
  let category: TriageResult['category'];
  let confidence: number;

  if (anomalyCount >= 3) {
    category = 'refer';
    confidence = Math.min(0.95, 0.7 + anomalyCount * 0.05);
  } else if (anomalyCount >= 1) {
    category = 'monitor';
    confidence = Math.min(0.90, 0.6 + anomalyCount * 0.1);
  } else {
    category = 'normal';
    confidence = 0.85;
  }

  // Summary
  const anomalyDomains = [...new Set(details.filter(d => d.isAnomaly).map(d => d.domain))];
  const summaryMap: Record<TriageResult['category'], string> = {
    'normal': '各面向發展在正常範圍內。',
    'monitor': `${anomalyDomains.join('、')}面向有待觀察。建議持續追蹤。`,
    'refer': `${anomalyDomains.join('、')}面向顯示異常。建議進一步專業評估。`,
  };

  return {
    category,
    confidence,
    summary: summaryMap[category],
    anomalyCount,
    details,
  };
}
