import { getEventsByModule, getMediaByType } from '../../lib/db/assessment-events';
import { analyzeBehavior } from './behavior-analysis';
import { analyzeVoiceFromEvents, analyzeVoiceFull, type VoiceMetrics } from './voice-analysis';
import { analyzeDrawing } from './drawing-analysis';
import { analyzeGrossMotor, type GrossMotorResult } from './gross-motor-analysis';
import { computeTriage, type TriageResult } from './triage';
import type { AgeGroupCDSA } from '../../lib/utils/age-groups';
import { getQuestionnaireMaxScores } from '../../lib/questionnaire/max-scores';

export interface AssessmentAnalysisResult {
  triageResult: TriageResult;
  behaviorMetrics: ReturnType<typeof analyzeBehavior>;
  voiceMetrics: VoiceMetrics;
  drawingResult: ReturnType<typeof analyzeDrawing>;
  grossMotorResult: GrossMotorResult | null;
  analyzedAt: Date;
}

/** Race a promise against a timeout. Returns null on timeout. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>(resolve => setTimeout(() => resolve(null), ms)),
  ]);
}

export async function analyzeAssessment(
  assessmentId: string,
  ageGroup: AgeGroupCDSA,
): Promise<AssessmentAnalysisResult> {
  // Gather events by module
  const gameEvents = await getEventsByModule(assessmentId, 'game');
  const voiceEvents = await getEventsByModule(assessmentId, 'voice');
  const drawingEvents = await getEventsByModule(assessmentId, 'drawing');
  const questionnaireEvents = await getEventsByModule(assessmentId, 'questionnaire');

  // Run analyses
  const allEvents = [...gameEvents, ...voiceEvents, ...drawingEvents, ...questionnaireEvents];
  const behaviorMetrics = analyzeBehavior(allEvents);

  // Voice analysis — 5s timeout, fallback to event-based
  const voiceEventData = voiceEvents.map(e => ({ eventType: e.eventType, data: e.data }));
  let voiceMetrics: VoiceMetrics;
  try {
    const voiceFiles = await getMediaByType(assessmentId, 'voice');
    if (voiceFiles.length > 0) {
      const fullResult = await withTimeout(
        analyzeVoiceFull(voiceFiles.map(f => f.blob), voiceEventData),
        5000,
      );
      voiceMetrics = fullResult ?? analyzeVoiceFromEvents(voiceEventData);
    } else {
      voiceMetrics = analyzeVoiceFromEvents(voiceEventData);
    }
  } catch {
    voiceMetrics = analyzeVoiceFromEvents(voiceEventData);
  }

  const drawingCompleteEvents = drawingEvents.filter(e => e.eventType === 'drawing_complete');
  const drawingResult = analyzeDrawing(drawingCompleteEvents.map(e => ({ data: e.data })));

  // Gross motor analysis — 10s timeout (MediaPipe model download can be slow)
  let grossMotorResult: GrossMotorResult | null = null;
  try {
    const videoFiles = await getMediaByType(assessmentId, 'video');
    if (videoFiles.length > 0) {
      grossMotorResult = await withTimeout(
        analyzeGrossMotor(videoFiles[0].blob, ageGroup),
        10000,
      );
    }
  } catch {
    // MediaPipe may fail — non-blocking
  }

  // Extract questionnaire scores by domain.
  // questionnaireMaxScores derives from questions.json (single source of truth) so
  // re-analysis can produce the same z-score as the live store path. Without this
  // the ASQ-3 norm scaling (mean_local = mean_asq × maxScore/60) would mis-scale
  // and z would be wrong. See spec §13.1 / Phase 2 commit.
  const questionnaireScores: Record<string, number> = {};
  for (const e of questionnaireEvents) {
    const domain = e.data.domain as string;
    const score = e.data.score as number;
    if (domain && typeof score === 'number') {
      questionnaireScores[domain] = (questionnaireScores[domain] ?? 0) + score;
    }
  }
  const hasQuestionnaire = Object.keys(questionnaireScores).length > 0;
  const questionnaireMaxScores = hasQuestionnaire ? getQuestionnaireMaxScores(ageGroup) : undefined;

  // Compute triage
  const triageResult = await computeTriage({
    ageGroup,
    behavior: behaviorMetrics,
    voice: voiceMetrics,
    drawing: drawingResult,
    questionnaireScores: hasQuestionnaire ? questionnaireScores : undefined,
    questionnaireMaxScores,
    grossMotor: grossMotorResult ? {
      classification: grossMotorResult.classification,
      confidence: grossMotorResult.confidence,
      features: grossMotorResult.features as unknown as Record<string, number>,
    } : undefined,
  });

  return {
    triageResult,
    behaviorMetrics,
    voiceMetrics,
    drawingResult,
    grossMotorResult,
    analyzedAt: new Date(),
  };
}
