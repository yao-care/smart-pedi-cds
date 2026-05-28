/**
 * 共用常數（gating 門檻 + domain 中文標籤）。
 *
 * 抽出到獨立檔的原因：triage.ts 從 schema.ts import `db` 取常模；
 * schema.ts 的 v6 upgrade tx 又要 import recompute-triage；recompute-triage
 * 若直接 import triage.ts 會形成循環（schema → recompute → triage → schema）。
 * 把無 side-effect 的純常數抽到這個 zero-import 檔，兩條路徑都從這裡讀。
 */

/** Per-detail isAnomaly threshold (z ≤ this = anomaly mark on detail).
 *  Per spec §7.2 (2026-05-28 rev): per-detail isAnomaly is UI 提示 only,
 *  does NOT participate in triage gating (gating uses per-domain z).
 *  Threshold lowered from previous mix (-1.5 / <0.5 raw) to a uniform -1 SD. */
export const PER_DETAIL_ANOMALY_Z = -1;

/** Gating thresholds for per-domain z composition (spec §7.2 2026-05-28 rev).
 *  ASQ-3-style: refer = any domain ≤ -2 SD; monitor = any domain ≤ -1 SD. */
export const DOMAIN_REFER_Z = -2;
export const DOMAIN_MONITOR_Z = -1;

/** Domain id → user-facing Chinese label for summary sentences. */
export const TRIAGE_DOMAIN_LABELS: Record<string, string> = {
  behavior: '行為',
  gross_motor: '粗動作',
  fine_motor: '細動作',
  language: '語言',
  language_comprehension: '語言理解',
  language_expression: '語言表達',
  cognition: '認知',
  social_emotional: '社交情緒',
  diet: '飲食',
};
