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

/**
 * Compose per-detail metrics into per-domain radar scores (0–100, 50 = 同齡平均).
 *
 * Path priority (spec §7.2 2026-05-28 rev + Phase 3 標註):
 *   1. **z path** (line ~`bZ`)：detail.directionalZ → mean → CDF percentile × 100.
 *      Phase 2 後**所有新評估**走這條：questionnaire 借 ASQ-3 常模 + 滿分縮放
 *      → directionalZ，其他 z-based 模組（behavior / drawing / voice / pose）
 *      早就走這條。
 *   2. **raw path** (line ~`bR`)：questionnaireScore × (value / maxScore) × 100.
 *      **僅給 v5→v6 升級前的舊評估資料 fallback**（v5 之前的 detail 沒有
 *      directionalZ）。Phase 5 v6 upgrade tx 完成後，所有歷史資料都應重算成
 *      帶 directionalZ 的格式，這條 path 實質 dead。**仍保留作為 IndexedDB
 *      升級失敗 / 跨裝置歷史資料的最後安全網**——失之為「答對比率」比顯示
 *      預設 50 好。
 *   3. **hybrid path** (line ~`bH`)：同 domain 同時混 raw + z（極罕見 corner
 *      case，例如部分 detail 重算成功部分失敗），平均兩條路徑的百分位。
 *      Phase 2+5 上線後**正常不會走到**，留作 defensive。
 *
 * `isHybrid` 旗標在 Phase 5 之後正常情況下永遠 false；RadarChart 的 hybrid icon
 * "⚖" 在新評估上不會出現。保留旗標讓老資料 / 升級異常路徑可被觀測。
 */
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

    // Prefer z path when directionalZ exists; only fall back to raw 得分率
    // path when the detail has no z (legacy v5 questionnaire record).
    if (d.directionalZ !== null && d.directionalZ !== undefined) {
      buckets[d.domain].zSum += d.directionalZ;
      buckets[d.domain].zCount++;
    } else if (d.metric === 'questionnaireScore' && d.maxScore && d.maxScore > 0) {
      buckets[d.domain].rawSum += (d.value as number) / d.maxScore;
      buckets[d.domain].rawCount++;
    }
    if (d.isAnomaly) buckets[d.domain].hasAnomaly = true;
  }

  return Object.entries(buckets).map(([domain, b]) => {
    let score = 50;
    if (b.zCount > 0 && b.rawCount === 0) {
      // 主路徑（Phase 2+5 後唯一活躍）：z → percentile
      score = Math.round(100 * zToPercentile(b.zSum / b.zCount));
    } else if (b.rawCount > 0 && b.zCount === 0) {
      // 舊資料 fallback：得分率（與 legend 「50=同齡平均」名實不符，僅限
      // v5 升級失敗的歷史 detail。Phase 5 v6 upgrade 後應消失）。
      score = Math.round(100 * b.rawSum / b.rawCount);
    } else if (b.zCount > 0 && b.rawCount > 0) {
      // hybrid corner case（極罕見：同 domain 部分重算成功）
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
