import { describe, it, expect } from 'vitest';
import { analyzeBehavior } from '../../src/engine/cdsa/behavior-analysis';
import type { AssessmentEvent } from '../../src/lib/db/schema';

function makeEvent(overrides: Partial<AssessmentEvent> = {}): AssessmentEvent {
  return {
    id: crypto.randomUUID(),
    assessmentId: 'assess-1',
    childId: 'child-1',
    moduleType: 'game',
    eventType: 'click',
    timestamp: new Date(),
    data: { stimulusId: 's1', latency: 1000, correct: true },
    ...overrides,
  };
}

describe('analyzeBehavior', () => {
  it('returns zeroed metrics on empty input', () => {
    const m = analyzeBehavior([]);
    expect(m.completionRate).toBe(0);
    expect(m.operationConsistency).toBe(0);
    expect(m.reactionLatency).toBe(0);
    expect(m.responseTimeDistribution.p50).toBe(0);
    expect(m.responseTimeDistribution.p95).toBe(0);
  });

  it('computes p50/p95 from latencies', () => {
    const events = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000].map((lat, i) =>
      makeEvent({ data: { stimulusId: `s${i}`, latency: lat, correct: true } }),
    );
    const m = analyzeBehavior(events);
    expect(m.responseTimeDistribution.p50).toBeGreaterThan(0);
    expect(m.responseTimeDistribution.p95).toBeGreaterThanOrEqual(m.responseTimeDistribution.p50);
    expect(m.reactionLatency).toBe(550); // mean of 100..1000
  });

  it('computes operationConsistency as proportion correct', () => {
    const events = [
      makeEvent({ data: { stimulusId: 's1', latency: 500, correct: true } }),
      makeEvent({ data: { stimulusId: 's2', latency: 500, correct: false } }),
      makeEvent({ data: { stimulusId: 's3', latency: 500, correct: true } }),
      makeEvent({ data: { stimulusId: 's4', latency: 500, correct: true } }),
    ];
    const m = analyzeBehavior(events);
    expect(m.operationConsistency).toBe(0.75);
  });

  it('counts retries when same stimulusId appears multiple times', () => {
    const events = [
      makeEvent({ data: { stimulusId: 's1', latency: 500, correct: false } }),
      makeEvent({ data: { stimulusId: 's1', latency: 600, correct: false } }),
      makeEvent({ data: { stimulusId: 's1', latency: 700, correct: true } }),
      makeEvent({ data: { stimulusId: 's2', latency: 500, correct: true } }),
    ];
    const m = analyzeBehavior(events);
    expect(m.retryCount).toBe(2); // s1 appeared 3 times → 2 retries
  });

  it('completionRate caps at 1', () => {
    // 4 unique stimuli, but 5 correct responses (impossible in practice, defensive cap)
    const events = [
      makeEvent({ data: { stimulusId: 's1', correct: true, latency: 100 } }),
      makeEvent({ data: { stimulusId: 's2', correct: true, latency: 100 } }),
      makeEvent({ data: { stimulusId: 's3', correct: true, latency: 100 } }),
      makeEvent({ data: { stimulusId: 's4', correct: true, latency: 100 } }),
      makeEvent({ data: { stimulusId: 's1', correct: true, latency: 100 } }),
    ];
    const m = analyzeBehavior(events);
    expect(m.completionRate).toBeLessThanOrEqual(1);
  });

  it('interactionRhythm is 0 with single event', () => {
    const m = analyzeBehavior([makeEvent()]);
    expect(m.interactionRhythm).toBe(0);
  });

  it('ignores non-game events for latency stats', () => {
    const events: AssessmentEvent[] = [
      makeEvent({ moduleType: 'voice', data: { latency: 99999 } }),
      makeEvent({ data: { stimulusId: 's1', latency: 1000, correct: true } }),
    ];
    const m = analyzeBehavior(events);
    expect(m.reactionLatency).toBe(1000); // voice event excluded
  });

  it('flags anomalies via qualityFlags.isAnomaly', () => {
    const events: AssessmentEvent[] = [
      makeEvent({ qualityFlags: { isComplete: true, isAnomaly: true } }),
      makeEvent({ qualityFlags: { isComplete: true, isAnomaly: false } }),
      makeEvent({ qualityFlags: { isComplete: true, isAnomaly: false } }),
      makeEvent({ qualityFlags: { isComplete: true, isAnomaly: false } }),
    ];
    const m = analyzeBehavior(events);
    expect(m.interruptionPattern).toBeCloseTo(0.25, 5);
  });
});
