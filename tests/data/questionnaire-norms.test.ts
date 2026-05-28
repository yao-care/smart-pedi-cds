import { describe, it, expect } from 'vitest';
import {
  getQuestionnaireNorm,
  ALL_QUESTIONNAIRE_DOMAINS,
  type QuestionnaireDomain,
} from '../../src/lib/baselines/questionnaire-norms';
import { AGE_GROUPS_CDSA, type AgeGroupCDSA } from '../../src/lib/utils/age-groups';
import rawTable18 from '../../src/data/baselines/asq3-table18-raw.json';

/**
 * 問卷常模 derivation 完整性 + mapping + 縮放正確性。
 *
 * 守門：
 *   1. 6 domain × 7 ageGroup = 42 格全部能取到 norm（無 throw、無 null）
 *   2. Communication 雙用：language_comprehension 與 language_expression 取到的 asq3Area
 *      必為 'communication'，且 asq3Mean/asq3Sd 完全相等
 *   3. 各 domain 的 asq3Area mapping 正確（spec §13.3）
 *   4. 縮放公式正確：mean_local = mean_asq × maxScore / 60
 *   5. 邊界：maxScore ≤ 0 throw
 *
 * spec: docs/superpowers/specs/2026-05-28-questionnaire-norms-design.md §13.3
 */

const ASQ3_MAX_SCORE = 60;
const FLOAT_TOLERANCE = 1e-9;

describe('questionnaire-norms — 6 × 7 = 42 格完整性', () => {
  it.each(ALL_QUESTIONNAIRE_DOMAINS)('domain %s 在 7 個 ageGroup 都能取到 norm', (domain) => {
    for (const ag of AGE_GROUPS_CDSA) {
      // 用 maxScore=4（本系統多數 cell 的滿分）測；不關心數值正確性，只關心不 throw
      const norm = getQuestionnaireNorm(domain as QuestionnaireDomain, ag, 4);
      expect(norm).toBeDefined();
      expect(norm.mean).toBeGreaterThan(0);
      expect(norm.sd).toBeGreaterThan(0);
    }
  });
});

describe('questionnaire-norms — ASQ-3 area mapping (spec §13.3)', () => {
  const EXPECTED_MAPPING: Record<QuestionnaireDomain, string> = {
    cognition:              'problem_solving',
    fine_motor:             'fine_motor',
    gross_motor:            'gross_motor',
    language_comprehension: 'communication',
    language_expression:    'communication',
    social_emotional:       'personal_social',
  };

  it.each(Object.entries(EXPECTED_MAPPING))('%s → ASQ-3 %s', (domain, expectedArea) => {
    const norm = getQuestionnaireNorm(domain as QuestionnaireDomain, '13-24m', 4);
    expect(norm.asq3Area).toBe(expectedArea);
  });
});

describe('questionnaire-norms — Communication 雙用（lang_comp + lang_exp 共用同組）', () => {
  it.each(AGE_GROUPS_CDSA)('ageGroup %s：lang_comp 與 lang_exp 共用同組 ASQ-3 Communication', (ag) => {
    const compNorm = getQuestionnaireNorm('language_comprehension', ag, 4);
    const expNorm = getQuestionnaireNorm('language_expression', ag, 4);
    expect(compNorm.asq3Area).toBe('communication');
    expect(expNorm.asq3Area).toBe('communication');
    expect(compNorm.asq3Mean).toBe(expNorm.asq3Mean);
    expect(compNorm.asq3Sd).toBe(expNorm.asq3Sd);
  });
});

describe('questionnaire-norms — interval mapping (spec §13.3 取中位)', () => {
  const EXPECTED_INTERVAL_MAPPING: Record<AgeGroupCDSA, string> = {
    '2-6m':   '4',
    '7-12m':  '10',
    '13-24m': '18',
    '25-36m': '30',
    '37-48m': '42',
    '49-60m': '54',
    '61-72m': '60',
  };

  it.each(Object.entries(EXPECTED_INTERVAL_MAPPING))('ageGroup %s → ASQ-3 interval %s 月', (ag, expectedInterval) => {
    const norm = getQuestionnaireNorm('cognition', ag as AgeGroupCDSA, 4);
    expect(norm.asq3Interval).toBe(expectedInterval);
  });
});

describe('questionnaire-norms — 滿分縮放公式 mean_local = mean_asq × maxScore / 60', () => {
  // 用 18-month / problem_solving 作 reference cell
  const rawCell = rawTable18.intervals['18'].problem_solving;

  it.each([2, 4, 6, 10, 60])('maxScore=%d 下縮放正確', (maxScore) => {
    const norm = getQuestionnaireNorm('cognition', '13-24m', maxScore);
    const expectedMean = rawCell.mean * maxScore / ASQ3_MAX_SCORE;
    const expectedSd = rawCell.sd * maxScore / ASQ3_MAX_SCORE;
    expect(Math.abs(norm.mean - expectedMean)).toBeLessThan(FLOAT_TOLERANCE);
    expect(Math.abs(norm.sd - expectedSd)).toBeLessThan(FLOAT_TOLERANCE);
    expect(norm.asq3Mean).toBe(rawCell.mean);
    expect(norm.asq3Sd).toBe(rawCell.sd);
  });

  it('maxScore=60 時 mean/sd 等於 ASQ-3 原始 mean/sd（縮放係數=1）', () => {
    const norm = getQuestionnaireNorm('cognition', '13-24m', 60);
    expect(norm.mean).toBe(rawCell.mean);
    expect(norm.sd).toBe(rawCell.sd);
  });
});

describe('questionnaire-norms — 邊界/錯誤', () => {
  it('maxScore=0 throw', () => {
    expect(() => getQuestionnaireNorm('cognition', '13-24m', 0)).toThrow(/maxScore/);
  });

  it('maxScore 負數 throw', () => {
    expect(() => getQuestionnaireNorm('cognition', '13-24m', -1)).toThrow(/maxScore/);
  });
});
