import type { AssessmentEvent } from '../../lib/db/schema';

export interface BehaviorMetrics {
  responseTimeDistribution: { p50: number; p95: number; std: number };
  interactionRhythm: number;       // CV of inter-event intervals
  operationConsistency: number;    // 0-1, similarity across same-type tasks
  retryCount: number;
  interruptionPattern: number;     // frequency of anomalies
  reactionLatency: number;         // mean first-response latency
  completionRate: number;          // completed / total
}

export function analyzeBehavior(events: AssessmentEvent[]): BehaviorMetrics {
  // Filter to game events with latency data
  const gameEvents = events.filter(e => e.moduleType === 'game' && e.eventType === 'click');

  // Response time distribution
  const latencies = gameEvents
    .map(e => e.data.latency as number)
    .filter((v): v is number => typeof v === 'number' && v > 0);

  const sortedLatencies = [...latencies].sort((a, b) => a - b);
  const p50 = sortedLatencies[Math.floor(sortedLatencies.length * 0.5)] ?? 0;
  const p95 = sortedLatencies[Math.floor(sortedLatencies.length * 0.95)] ?? 0;
  const latencyMean = latencies.length > 0 ? latencies.reduce((s, v) => s + v, 0) / latencies.length : 0;
  const latencyStd = latencies.length > 1
    ? Math.sqrt(latencies.reduce((s, v) => s + (v - latencyMean) ** 2, 0) / (latencies.length - 1))
    : 0;

  // Interaction rhythm — CV of inter-event intervals
  const timestamps = events.map(e => e.timestamp.getTime()).sort((a, b) => a - b);
  const intervals = timestamps.slice(1).map((t, i) => t - timestamps[i]);
  const intervalMean = intervals.length > 0 ? intervals.reduce((s, v) => s + v, 0) / intervals.length : 0;
  const intervalStd = intervals.length > 1
    ? Math.sqrt(intervals.reduce((s, v) => s + (v - intervalMean) ** 2, 0) / (intervals.length - 1))
    : 0;
  const interactionRhythm = intervalMean > 0 ? intervalStd / intervalMean : 0;

  // Operation consistency — proportion of correct responses
  const correctCount = gameEvents.filter(e => e.data.correct === true).length;
  const operationConsistency = gameEvents.length > 0 ? correctCount / gameEvents.length : 0;

  // Retry count — events with same stimulusId
  const stimulusCounts = new Map<string, number>();
  for (const e of gameEvents) {
    const sid = e.data.stimulusId as string;
    if (sid) stimulusCounts.set(sid, (stimulusCounts.get(sid) ?? 0) + 1);
  }
  const retryCount = [...stimulusCounts.values()].reduce((s, c) => s + Math.max(0, c - 1), 0);

  // Interruption pattern
  const anomalyEvents = events.filter(e => e.qualityFlags?.isAnomaly);
  const interruptionPattern = events.length > 0 ? anomalyEvents.length / events.length : 0;

  // Reaction latency — mean latency
  const reactionLatency = latencyMean;

  // Completion rate
  const totalTasks = new Set(gameEvents.map(e => e.data.stimulusId as string)).size;
  const completedTasks = gameEvents.filter(e => e.data.correct === true).length;
  const completionRate = totalTasks > 0 ? Math.min(1, completedTasks / totalTasks) : 0;

  return {
    responseTimeDistribution: { p50, p95, std: latencyStd },
    interactionRhythm,
    operationConsistency,
    retryCount,
    interruptionPattern,
    reactionLatency,
    completionRate,
  };
}
