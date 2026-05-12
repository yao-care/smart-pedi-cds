export type RiskLevel = 'normal' | 'advisory' | 'warning' | 'critical';

export const RISK_LEVELS: readonly RiskLevel[] = ['normal', 'advisory', 'warning', 'critical'] as const;

/** Returns numeric severity 0-3 (normal=0, critical=3) */
export function riskSeverity(level: RiskLevel): number {
  return RISK_LEVELS.indexOf(level);
}

/** Returns the highest severity level from the given levels */
export function maxRisk(...levels: RiskLevel[]): RiskLevel {
  return levels.reduce((max, level) =>
    riskSeverity(level) > riskSeverity(max) ? level : max,
    'normal' as RiskLevel
  );
}

/** Returns true if 'to' is more severe than 'from' */
export function isEscalation(from: RiskLevel, to: RiskLevel): boolean {
  return riskSeverity(to) > riskSeverity(from);
}

/** Returns the CSS custom property name for a risk level color */
export function riskColor(level: RiskLevel): string {
  return `--color-risk-${level}`;
}

/** Returns the CSS custom property name for a risk level background */
export function riskBgColor(level: RiskLevel): string {
  return `--color-risk-${level}-bg`;
}
