// Web Worker — runs in separate thread
// Communication via postMessage/onmessage
// Self-contained: no external imports

/// <reference lib="webworker" />
declare let self: DedicatedWorkerGlobalScope;
export {}; // ensure this file is treated as a module

export type RiskLevel = 'normal' | 'advisory' | 'warning' | 'critical';

export interface RuleSet {
  version: string;
  age_groups: Record<string, Record<string, {
    normal: [number, number];
    advisory: [number, number];
    warning: [number, number];
  }>>;
  multi_indicator: { advisory_count_for_warning: number };
  trend: { consecutive_days_for_escalation: number };
  deduplication: { window_minutes: number };
}

export interface ObservationInput {
  indicator: string;    // indicator name (e.g., 'heart_rate')
  value: number;
  timestamp: number;    // epoch ms
}

export interface RuleEngineRequest {
  type: 'evaluate';
  patientId: string;
  ageGroup: string;     // 'infant' | 'toddler' | 'preschool'
  observations: ObservationInput[];
  rules: RuleSet;
  recentAlerts?: Array<{ indicator: string; timestamp: number }>;  // for dedup
  trendHistory?: Record<string, number[]>;  // indicator -> last N days' deviation values
}

export interface IndicatorResult {
  indicator: string;
  value: number;
  level: RiskLevel;
  range: [number, number] | null;  // the threshold range that matched
  rationale: string;
}

export interface RuleEngineResponse {
  type: 'result';
  patientId: string;
  overallLevel: RiskLevel;
  indicators: IndicatorResult[];
  rationale: string;
  ruleVersion: string;
  escalated: boolean;  // true if multi-indicator or trend escalation applied
}

function evaluateIndicator(
  indicator: string,
  value: number,
  thresholds: { normal: [number, number]; advisory: [number, number]; warning: [number, number] },
): IndicatorResult {
  // Check from most severe to least severe
  const { normal, advisory, warning } = thresholds;

  // Critical: outside warning range (implicit level)
  if (value < warning[0] || value > warning[1]) {
    return {
      indicator, value, level: 'critical',
      range: warning,
      rationale: `${indicator}=${value}, outside warning range [${warning[0]}, ${warning[1]}] -> critical`,
    };
  }

  // Warning: outside advisory but within warning
  if (value < advisory[0] || value > advisory[1]) {
    return {
      indicator, value, level: 'warning',
      range: advisory,
      rationale: `${indicator}=${value}, outside advisory range [${advisory[0]}, ${advisory[1]}] -> warning`,
    };
  }

  // Advisory: outside normal but within advisory
  if (value < normal[0] || value > normal[1]) {
    return {
      indicator, value, level: 'advisory',
      range: normal,
      rationale: `${indicator}=${value}, outside normal range [${normal[0]}, ${normal[1]}] -> advisory`,
    };
  }

  // Normal
  return {
    indicator, value, level: 'normal',
    range: normal,
    rationale: `${indicator}=${value}, within normal range [${normal[0]}, ${normal[1]}]`,
  };
}

function isDuplicate(
  indicator: string,
  recentAlerts: Array<{ indicator: string; timestamp: number }>,
  windowMinutes: number,
): boolean {
  const cutoff = Date.now() - windowMinutes * 60 * 1000;
  return recentAlerts.some(a => a.indicator === indicator && a.timestamp > cutoff);
}

function detectTrendEscalation(
  trendHistory: Record<string, number[]>,
  consecutiveDays: number,
): boolean {
  // Check if any indicator has monotonically increasing deviation for N consecutive days
  for (const values of Object.values(trendHistory)) {
    if (values.length < consecutiveDays) continue;
    const recent = values.slice(-consecutiveDays);
    let increasing = true;
    for (let i = 1; i < recent.length; i++) {
      if (recent[i] <= recent[i - 1]) {
        increasing = false;
        break;
      }
    }
    if (increasing) return true;
  }
  return false;
}

self.onmessage = (event: MessageEvent<RuleEngineRequest>) => {
  const req = event.data;
  if (req.type !== 'evaluate') return;

  const ageGroupRules = req.rules.age_groups[req.ageGroup];
  if (!ageGroupRules) {
    self.postMessage({
      type: 'result',
      patientId: req.patientId,
      overallLevel: 'normal',
      indicators: [],
      rationale: `No rules found for age group: ${req.ageGroup}`,
      ruleVersion: req.rules.version,
      escalated: false,
    } satisfies RuleEngineResponse);
    return;
  }

  const results: IndicatorResult[] = [];
  const windowMinutes = req.rules.deduplication.window_minutes;

  for (const obs of req.observations) {
    const thresholds = ageGroupRules[obs.indicator];
    if (!thresholds) continue; // unknown indicator, skip

    // Deduplication check
    if (req.recentAlerts && isDuplicate(obs.indicator, req.recentAlerts, windowMinutes)) {
      continue;
    }

    const result = evaluateIndicator(obs.indicator, obs.value, thresholds);
    results.push(result);
  }

  // Determine overall level
  const levels: RiskLevel[] = results.map(r => r.level);
  let overallLevel: RiskLevel = 'normal';

  if (levels.includes('critical')) {
    overallLevel = 'critical';
  } else if (levels.includes('warning')) {
    overallLevel = 'warning';
  } else if (levels.includes('advisory')) {
    overallLevel = 'advisory';
  }

  // Multi-indicator escalation: N+ advisories -> warning
  let escalated = false;
  const advisoryCount = levels.filter(l => l === 'advisory').length;
  if (overallLevel === 'advisory' && advisoryCount >= req.rules.multi_indicator.advisory_count_for_warning) {
    overallLevel = 'warning';
    escalated = true;
  }

  // Trend escalation: consecutive days of worsening
  if (req.trendHistory && !escalated) {
    const trendEscalation = detectTrendEscalation(
      req.trendHistory,
      req.rules.trend.consecutive_days_for_escalation,
    );
    if (trendEscalation && overallLevel !== 'critical') {
      // Escalate one level
      if (overallLevel === 'normal') overallLevel = 'advisory';
      else if (overallLevel === 'advisory') overallLevel = 'warning';
      else if (overallLevel === 'warning') overallLevel = 'critical';
      escalated = true;
    }
  }

  const rationale = results
    .filter(r => r.level !== 'normal')
    .map(r => `[Rule] ${r.rationale}`)
    .join('; ') || 'All indicators normal';

  self.postMessage({
    type: 'result',
    patientId: req.patientId,
    overallLevel,
    indicators: results,
    rationale: escalated ? `${rationale} [Escalated]` : rationale,
    ruleVersion: req.rules.version,
    escalated,
  } satisfies RuleEngineResponse);
};
