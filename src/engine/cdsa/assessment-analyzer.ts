import { getEventsByModule } from '../../lib/db/assessment-events';
import { analyzeBehavior } from './behavior-analysis';
import { analyzeVoiceFromEvents } from './voice-analysis';
import { analyzeDrawing } from './drawing-analysis';
import { computeTriage, type TriageResult } from './triage';
import type { AgeGroupCDSA } from '../../lib/utils/age-groups';

export interface AssessmentAnalysisResult {
  triageResult: TriageResult;
  behaviorMetrics: ReturnType<typeof analyzeBehavior>;
  voiceMetrics: ReturnType<typeof analyzeVoiceFromEvents>;
  drawingResult: ReturnType<typeof analyzeDrawing>;
  analyzedAt: Date;
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
  const voiceMetrics = analyzeVoiceFromEvents(voiceEvents.map(e => ({ eventType: e.eventType, data: e.data })));

  const drawingCompleteEvents = drawingEvents.filter(e => e.eventType === 'drawing_complete');
  const drawingResult = analyzeDrawing(drawingCompleteEvents.map(e => ({ data: e.data })));

  // Extract questionnaire scores by domain
  const questionnaireScores: Record<string, number> = {};
  for (const e of questionnaireEvents) {
    const domain = e.data.domain as string;
    const score = e.data.score as number;
    if (domain && typeof score === 'number') {
      questionnaireScores[domain] = (questionnaireScores[domain] ?? 0) + score;
    }
  }

  // Compute triage
  const triageResult = computeTriage({
    ageGroup,
    behavior: behaviorMetrics,
    voice: voiceMetrics,
    drawing: drawingResult,
    questionnaireScores: Object.keys(questionnaireScores).length > 0 ? questionnaireScores : undefined,
  });

  return {
    triageResult,
    behaviorMetrics,
    voiceMetrics,
    drawingResult,
    analyzedAt: new Date(),
  };
}
