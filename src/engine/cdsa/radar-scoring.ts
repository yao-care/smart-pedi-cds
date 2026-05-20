import type { TriageResult } from './triage';

export interface DomainScore {
  domain: string;
  score: number;
  hasAnomaly: boolean;
  isHybrid: boolean;
}

/**
 * Standard normal CDF approximation (Abramowitz & Stegun 26.2.17).
 * accuracy ~7.5e-8, well within UI display precision.
 */
export function zToPercentile(z: number): number {
  if (z === 0) return 0.5;
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804 * Math.exp(-z * z / 2);
  const p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z > 0 ? 1 - p : p;
}

export function computeDomainScores(triageResult: TriageResult | null): DomainScore[] {
  if (!triageResult) return [];
  const buckets: Record<string, {
    zSum: number; zCount: number;
    rawSum: number; rawCount: number;
    hasAnomaly: boolean;
  }> = {};

  for (const d of triageResult.details) {
    if (!buckets[d.domain]) {
      buckets[d.domain] = { zSum: 0, zCount: 0, rawSum: 0, rawCount: 0, hasAnomaly: false };
    }

    if (d.metric === 'questionnaireScore' && d.maxScore && d.maxScore > 0) {
      buckets[d.domain].rawSum += (d.value as number) / d.maxScore;
      buckets[d.domain].rawCount++;
    } else if (d.directionalZ !== null && d.directionalZ !== undefined) {
      buckets[d.domain].zSum += d.directionalZ;
      buckets[d.domain].zCount++;
    }
    if (d.isAnomaly) buckets[d.domain].hasAnomaly = true;
  }

  return Object.entries(buckets).map(([domain, b]) => {
    let score = 50;
    if (b.rawCount > 0 && b.zCount === 0) {
      score = Math.round(100 * b.rawSum / b.rawCount);
    } else if (b.zCount > 0 && b.rawCount === 0) {
      score = Math.round(100 * zToPercentile(b.zSum / b.zCount));
    } else if (b.zCount > 0 && b.rawCount > 0) {
      const rawPct = b.rawSum / b.rawCount;
      const zPct = zToPercentile(b.zSum / b.zCount);
      score = Math.round(100 * (rawPct + zPct) / 2);
    }
    return {
      domain,
      score,
      hasAnomaly: b.hasAnomaly,
      isHybrid: b.zCount > 0 && b.rawCount > 0,
    };
  });
}
