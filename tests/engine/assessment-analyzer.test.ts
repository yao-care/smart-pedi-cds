import { describe, it, expect, beforeEach } from 'vitest';
import { analyzeAssessment } from '../../src/engine/cdsa/assessment-analyzer';
import { recordEvents } from '../../src/lib/db/assessment-events';
import { db } from '../../src/lib/db/schema';

/**
 * Integration test for `analyzeAssessment`. Uses fake-indexeddb (set up
 * in tests/setup.ts) to seed real events, then asserts the full pipeline
 * — analyzeBehavior + analyzeVoiceFromEvents + analyzeDrawing + computeTriage —
 * runs to completion without media files.
 *
 * Media-blob paths (analyzeVoiceFull, analyzeGrossMotor) are NOT exercised
 * here because they require AudioContext / MediaPipe / OffscreenCanvas which
 * jsdom does not provide. Skipping them is deliberate: no media in the DB
 * means the analyzer correctly falls back to event-only voice analysis and
 * leaves grossMotorResult null.
 */
describe('analyzeAssessment integration', () => {
  const assessmentId = 'test-assess-001';
  const childId = 'test-child-001';

  beforeEach(async () => {
    await db.assessmentEvents.clear();
    await db.mediaFiles.clear();
  });

  it('runs end-to-end on an empty assessment (no events) without throwing', async () => {
    const result = await analyzeAssessment(assessmentId, '25-36m');

    expect(result.triageResult).toBeDefined();
    expect(result.triageResult.category).toMatch(/^(normal|monitor|refer)$/);
    expect(result.behaviorMetrics).toBeDefined();
    expect(result.voiceMetrics).toBeDefined();
    expect(result.drawingResult).toBeDefined();
    expect(result.grossMotorResult).toBeNull();
    expect(result.analyzedAt).toBeInstanceOf(Date);
  });

  it('aggregates voice events into voiceMetrics via event-only fallback', async () => {
    await recordEvents([
      {
        assessmentId, childId, moduleType: 'voice',
        eventType: 'voice_end', timestamp: new Date(),
        data: { duration: 2.5 },
      },
      {
        assessmentId, childId, moduleType: 'voice',
        eventType: 'voice_end', timestamp: new Date(),
        data: { duration: 1.5 },
      },
      {
        assessmentId, childId, moduleType: 'voice',
        eventType: 'voice_skip', timestamp: new Date(),
        data: {},
      },
    ]);

    const result = await analyzeAssessment(assessmentId, '25-36m');

    expect(result.voiceMetrics.voiceDurationTotal).toBeCloseTo(4.0, 5);
    expect(result.voiceMetrics.fluencyPauseCount).toBe(1);
    // Event-only fallback returns null for audio-derived fields
    expect(result.voiceMetrics.pitchMean).toBeNull();
    expect(result.voiceMetrics.mfccMean).toBeNull();
  });

  it('only considers drawing_complete events for drawing analysis', async () => {
    const completeStroke = [
      [
        { x: 0,   y: 0,   t: 0   },
        { x: 100, y: 0,   t: 100 },
        { x: 100, y: 100, t: 200 },
        { x: 0,   y: 100, t: 300 },
        { x: 0,   y: 0,   t: 400 },
      ],
    ];

    await recordEvents([
      {
        assessmentId, childId, moduleType: 'drawing',
        eventType: 'drawing_start', timestamp: new Date(),
        data: { shapeId: 'square' }, // ignored — wrong eventType
      },
      {
        assessmentId, childId, moduleType: 'drawing',
        eventType: 'drawing_complete', timestamp: new Date(),
        data: { shapeId: 'square', strokes: completeStroke },
      },
    ]);

    const result = await analyzeAssessment(assessmentId, '25-36m');
    expect(result.drawingResult.shapes).toHaveLength(1);
    expect(result.drawingResult.shapes[0].shapeId).toBe('square');
    expect(result.drawingResult.overallScore).toBeGreaterThan(0);
  });

  it('aggregates questionnaire scores per domain into triage input', async () => {
    await recordEvents([
      {
        assessmentId, childId, moduleType: 'questionnaire',
        eventType: 'answer', timestamp: new Date(),
        data: { domain: 'language_expression', score: 2 },
      },
      {
        assessmentId, childId, moduleType: 'questionnaire',
        eventType: 'answer', timestamp: new Date(),
        data: { domain: 'language_expression', score: 1 },
      },
      {
        assessmentId, childId, moduleType: 'questionnaire',
        eventType: 'answer', timestamp: new Date(),
        data: { domain: 'social_emotional', score: 0 },
      },
    ]);

    const result = await analyzeAssessment(assessmentId, '25-36m');
    // Triage result should reference the questionnaire domains
    expect(result.triageResult).toBeDefined();
    expect(result.triageResult.summary).toBeTruthy();
  });

  it('returns grossMotorResult: null when no video media exists', async () => {
    const result = await analyzeAssessment(assessmentId, '25-36m');
    expect(result.grossMotorResult).toBeNull();
  });

  it('isolates results by assessmentId (no cross-talk between assessments)', async () => {
    await recordEvents([
      {
        assessmentId: 'A', childId, moduleType: 'voice',
        eventType: 'voice_end', timestamp: new Date(),
        data: { duration: 3.0 },
      },
      {
        assessmentId: 'B', childId, moduleType: 'voice',
        eventType: 'voice_end', timestamp: new Date(),
        data: { duration: 7.0 },
      },
    ]);

    const a = await analyzeAssessment('A', '25-36m');
    const b = await analyzeAssessment('B', '25-36m');

    expect(a.voiceMetrics.voiceDurationTotal).toBeCloseTo(3.0, 5);
    expect(b.voiceMetrics.voiceDurationTotal).toBeCloseTo(7.0, 5);
  });
});
