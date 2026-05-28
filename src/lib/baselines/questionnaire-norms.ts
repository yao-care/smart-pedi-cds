/**
 * 問卷面向常模（ASQ-3 借用 + 滿分縮放 + 5→6 面向 mapping）。
 *
 * 設計決策（拍板 2026-05-28，spec §7.1 / §13.3）：
 *   - 資料源：ASQ-3 User's Guide Table 18（Squires et al. 2009, p.171），原始抄錄於
 *     `src/data/baselines/asq3-table18-raw.json`（cell-level OCR consistency 已通過測試守門）。
 *   - 5 個 ASQ-3 area → 6 個 CDSA 問卷 domain：
 *       Communication      → language_comprehension AND language_expression（共用同組常模）
 *       Gross Motor        → gross_motor
 *       Fine Motor         → fine_motor
 *       Problem Solving    → cognition
 *       Personal-Social    → social_emotional
 *     Communication 共用：本系統把「理解」「表達」拆兩個 domain，但 ASQ-3 是合併單一 area。
 *     此假設「兩 sub-domain 分佈相似」在臨床上不完全成立，未來校正時可分離（spec §13.3）。
 *   - 21 個 ASQ-3 interval → 7 個 CDSA ageGroup（取中位 interval，spec §13.3）：
 *       2-6m → 4m / 7-12m → 10m / 13-24m → 18m / 25-36m → 30m
 *       37-48m → 42m / 49-60m → 54m / 61-72m → 60m（ASQ-3 上限 60m，文案 Phase 4 標明）
 *   - 滿分縮放：ASQ-3 max=60、本系統 maxScore 因 (domain × ageGroup) 而異（1-2 題 × 2 分）。
 *     縮放：mean_local = mean_asq × maxScore_local / 60；sd_local = sd_asq × maxScore_local / 60。
 *     假設「答對比率分佈相似」。
 *
 * Runtime 行為：本檔在 module load 時 derive 一次（純資料轉換、無副作用），triage 直接呼叫
 * `getQuestionnaireNorm(domain, ageGroup, maxScore)` 取縮放後的 {mean, sd}。
 */

import rawTable18 from '../../data/baselines/asq3-table18-raw.json';
import type { AgeGroupCDSA } from '../utils/age-groups';

/** 本系統 6 個問卷 domain（與 triage.ts KNOWN_QUESTIONNAIRE_DOMAINS 一致）。 */
export type QuestionnaireDomain =
  | 'cognition'
  | 'fine_motor'
  | 'gross_motor'
  | 'language_comprehension'
  | 'language_expression'
  | 'social_emotional';

/** ASQ-3 5 個 area key。 */
type Asq3Area =
  | 'communication'
  | 'gross_motor'
  | 'fine_motor'
  | 'problem_solving'
  | 'personal_social';

/** 6 個 CDSA domain → ASQ-3 area 的對應（Communication 雙用）。 */
const DOMAIN_TO_ASQ3_AREA: Record<QuestionnaireDomain, Asq3Area> = {
  cognition:              'problem_solving',
  fine_motor:             'fine_motor',
  gross_motor:            'gross_motor',
  language_comprehension: 'communication',
  language_expression:    'communication',
  social_emotional:       'personal_social',
};

/** 7 個 CDSA ageGroup → ASQ-3 interval（月）的對應。 */
const AGE_GROUP_TO_ASQ3_INTERVAL: Record<AgeGroupCDSA, '4' | '10' | '18' | '30' | '42' | '54' | '60'> = {
  '2-6m':   '4',
  '7-12m':  '10',
  '13-24m': '18',
  '25-36m': '30',
  '37-48m': '42',
  '49-60m': '54',
  '61-72m': '60',
};

/** ASQ-3 每面向滿分（fixed）。 */
const ASQ3_MAX_SCORE = 60;

interface RawCell {
  mean: number;
  sd: number;
  cutoff1Sd: number;
  cutoff15Sd: number;
  cutoff2Sd: number;
}
interface RawIntervals {
  [interval: string]: Record<Asq3Area, RawCell>;
}

const TABLE18 = (rawTable18 as { intervals: RawIntervals }).intervals;

export interface QuestionnaireNorm {
  /** 縮放後本系統 scale 下的 mean（單位：本系統 maxScore 內的得分）。 */
  mean: number;
  /** 縮放後本系統 scale 下的 SD。 */
  sd: number;
  /** 縮放前 ASQ-3 原始 mean（除錯/透明化用）。 */
  asq3Mean: number;
  /** 縮放前 ASQ-3 原始 SD。 */
  asq3Sd: number;
  /** 對應的 ASQ-3 area 名稱（供透明化文案使用）。 */
  asq3Area: Asq3Area;
  /** 對應的 ASQ-3 interval（月）。 */
  asq3Interval: string;
}

/**
 * 取 (domain, ageGroup) 在指定 maxScore 下的同齡常模 {mean, sd}。
 *
 * @param domain - 6 個本系統問卷 domain 之一
 * @param ageGroup - 7 個 CDSA ageGroup 之一
 * @param maxScore - 本系統該 (domain, ageGroup) 的問卷滿分（從 questionnaireMaxScores 傳入）
 * @returns 縮放後 {mean, sd}；若 ASQ-3 表內無對應 cell（理論上 7×6=42 格都有）會 throw
 */
export function getQuestionnaireNorm(
  domain: QuestionnaireDomain,
  ageGroup: AgeGroupCDSA,
  maxScore: number,
): QuestionnaireNorm {
  const area = DOMAIN_TO_ASQ3_AREA[domain];
  const interval = AGE_GROUP_TO_ASQ3_INTERVAL[ageGroup];
  const cell = TABLE18[interval]?.[area];
  if (!cell) {
    throw new Error(
      `[questionnaire-norms] ASQ-3 raw 缺 cell: interval=${interval}, area=${area} ` +
      `(from domain=${domain}, ageGroup=${ageGroup})`,
    );
  }
  if (maxScore <= 0) {
    throw new Error(`[questionnaire-norms] maxScore 必須 > 0，收到 ${maxScore}`);
  }
  const scale = maxScore / ASQ3_MAX_SCORE;
  return {
    mean: cell.mean * scale,
    sd: cell.sd * scale,
    asq3Mean: cell.mean,
    asq3Sd: cell.sd,
    asq3Area: area,
    asq3Interval: interval,
  };
}

/** 列舉所有 (domain, ageGroup) 組合用以完整性測試。 */
export const ALL_QUESTIONNAIRE_DOMAINS: readonly QuestionnaireDomain[] = [
  'cognition', 'fine_motor', 'gross_motor',
  'language_comprehension', 'language_expression', 'social_emotional',
];
