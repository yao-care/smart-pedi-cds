// Web Worker — baseline calculation
// Self-contained: no external imports

/// <reference lib="webworker" />
declare let self: DedicatedWorkerGlobalScope;
export {}; // ensure this file is treated as a module

export interface BaselineRequest {
  type: 'calculate';
  patientId: string;
  /** Historical observations per indicator: { indicator_name: number[] } */
  history: Record<string, number[]>;
  /** Current latest values per indicator */
  currentValues: Record<string, number>;
  /** Population baseline fallback (from Content Collections) */
  populationBaseline?: Record<string, { mean: number; std: number }>;
  /** Minimum samples required for personal baseline */
  minSamples?: number;
}

export interface BaselineResult {
  indicator: string;
  mean: number;
  std: number;
  sampleCount: number;
  isPersonal: boolean;  // true if personal baseline, false if population fallback
  zScore: number | null; // null if no current value
  currentValue: number | null;
}

export interface BaselineResponse {
  type: 'result';
  patientId: string;
  baselines: BaselineResult[];
  /** z-score vector for ML input (7 elements, null for missing) */
  zScoreVector: (number | null)[];
}

/** Fixed indicator order — matches the 7 indicators in the spec */
const INDICATOR_ORDER = [
  'heart_rate', 'spo2', 'respiratory_rate', 'temperature',
  'sleep_quality', 'activity_level', 'sugar_intake',
] as const;

function calculateMean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function calculateStd(values: number[], mean: number): number {
  if (values.length < 2) return 0;
  // Sample standard deviation (n-1 denominator)
  const squaredDiffs = values.map(v => (v - mean) ** 2);
  const variance = squaredDiffs.reduce((sum, v) => sum + v, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function calculateZScore(value: number, mean: number, std: number): number {
  // Spec F02.2: when std = 0, z-score = 0 (avoid division by zero)
  if (std === 0) return 0;
  return (value - mean) / std;
}

self.onmessage = (event: MessageEvent<BaselineRequest>) => {
  const req = event.data;
  if (req.type !== 'calculate') return;

  const minSamples = req.minSamples ?? 20;
  const baselines: BaselineResult[] = [];

  for (const indicator of INDICATOR_ORDER) {
    const history = req.history[indicator] ?? [];
    const currentValue = req.currentValues[indicator] ?? null;
    let mean: number;
    let std: number;
    let sampleCount: number;
    let isPersonal: boolean;

    if (history.length >= minSamples) {
      // Personal baseline
      mean = calculateMean(history);
      std = calculateStd(history, mean);
      sampleCount = history.length;
      isPersonal = true;
    } else if (req.populationBaseline?.[indicator]) {
      // Population fallback
      const pop = req.populationBaseline[indicator];
      mean = pop.mean;
      std = pop.std;
      sampleCount = history.length;
      isPersonal = false;
    } else {
      // No baseline available — skip this indicator
      baselines.push({
        indicator,
        mean: 0,
        std: 0,
        sampleCount: history.length,
        isPersonal: false,
        zScore: null,
        currentValue,
      });
      continue;
    }

    const zScore = currentValue !== null ? calculateZScore(currentValue, mean, std) : null;

    baselines.push({
      indicator,
      mean,
      std,
      sampleCount,
      isPersonal,
      zScore,
      currentValue,
    });
  }

  // Build z-score vector in fixed indicator order
  const zScoreVector = INDICATOR_ORDER.map(ind => {
    const baseline = baselines.find(b => b.indicator === ind);
    return baseline?.zScore ?? null;
  });

  self.postMessage({
    type: 'result',
    patientId: req.patientId,
    baselines,
    zScoreVector,
  } satisfies BaselineResponse);
};
