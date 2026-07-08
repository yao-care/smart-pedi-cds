/**
 * 從 questions.json 計算每 (domain × ageGroup) 的問卷滿分。
 *
 * 為什麼存在：ASQ-3 常模縮放（mean_local = mean_asq × maxScore/60）要求 maxScore 準確，
 * 不能 fallback 到 hardcoded 10。本 helper 從 questions.json 真相源算出每 domain 滿分，
 * 作為單一真相源供守門測試斷言。live 評估路徑 QuestionnaireModule 直接用 section 的
 * `s.max` 填 store（值同源）；re-analyze 路徑（schema.ts upgrade → recompute-triage）讀
 * 持久化 detail 內的 `maxScore`。此 helper 讓「questions.json 算出的滿分」有一處可驗證。
 *
 * spec: docs/superpowers/specs/2026-05-28-questionnaire-norms-design.md §6 Phase 2 + §13.1
 */

import questionsJson from '../../data/questionnaire/questions.json' with { type: 'json' };
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
