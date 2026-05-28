/**
 * 從 questions.json 計算每 (domain × ageGroup) 的問卷滿分。
 *
 * 為什麼存在：本系統有兩條呼叫 triage 的路徑：
 *   1. Live 評估：QuestionnaireModule → store → ResultView → triage（store 內已有 maxScores）
 *   2. Re-analyze：assessment-analyzer 從 IndexedDB events 重算（events 沒存 maxScore）
 * Phase 1 引入 ASQ-3 常模縮放後（mean_local = mean_asq × maxScore/60），maxScore 不能再 fallback
 * 到 hardcoded 10，必須準確。本 helper 從 questions.json 真相源算出，兩條路徑共用。
 *
 * spec: docs/superpowers/specs/2026-05-28-questionnaire-norms-design.md §6 Phase 2 + §13.1
 */

import questionsJson from '../../data/questionnaire/questions.json';
import type { AgeGroupCDSA } from '../utils/age-groups';

interface QuestionOption {
  value: string;
  label: string;
  score: number;
}
interface Question {
  id: string;
  domain: string;
  domainLabel: string;
  ageGroups: string[];
  text: string;
  options: QuestionOption[];
}

/** Build a memoized map: ageGroup → (domain → maxScore). */
const MAX_SCORES_BY_AGE: Record<string, Record<string, number>> = (() => {
  const map: Record<string, Record<string, number>> = {};
  const questions = (questionsJson as { questions: Question[] }).questions;
  for (const q of questions) {
    const itemMax = Math.max(...q.options.map((o) => o.score));
    for (const ag of q.ageGroups) {
      if (!map[ag]) map[ag] = {};
      map[ag][q.domain] = (map[ag][q.domain] ?? 0) + itemMax;
    }
  }
  return map;
})();

/**
 * 取得指定 ageGroup 下每個 domain 的問卷滿分。
 *
 * @param ageGroup CDSA ageGroup
 * @returns { [domain]: maxScore } — 只含該 ageGroup 有題目的 domain
 *          (例如 2-6m 沒有 cognition/language_expression 題，回傳就不含這兩個 key)
 */
export function getQuestionnaireMaxScores(ageGroup: AgeGroupCDSA): Record<string, number> {
  return MAX_SCORES_BY_AGE[ageGroup] ?? {};
}
