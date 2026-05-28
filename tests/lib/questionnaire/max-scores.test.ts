import { describe, it, expect } from 'vitest';
import { getQuestionnaireMaxScores } from '../../../src/lib/questionnaire/max-scores';
import { AGE_GROUPS_CDSA } from '../../../src/lib/utils/age-groups';

/**
 * 守門 getQuestionnaireMaxScores 回傳值跟 questions.json 實際內容一致。
 *
 * 期望值是 spec §13.1 已用 jq 統計過的結果：
 *   2-6m   : gross_motor=4, fine_motor=2, language_comprehension=2, social_emotional=2
 *   7-12m  : 6 domain，多數 maxScore=4，少數 maxScore=2
 *   13-24m ~ 61-72m : 6 domain 全部 maxScore=4
 *
 * 任一不一致代表 questions.json 改了但沒同步檢視常模縮放（會讓 z-score 算錯）。
 */

describe('getQuestionnaireMaxScores', () => {
  it('2-6m 應有 4 個 domain（無 cognition、無 language_expression）', () => {
    const m = getQuestionnaireMaxScores('2-6m');
    expect(m).toEqual({
      gross_motor: 4,
      fine_motor: 2,
      language_comprehension: 2,
      social_emotional: 2,
    });
  });

  it('7-12m 應有 6 個 domain', () => {
    const m = getQuestionnaireMaxScores('7-12m');
    expect(Object.keys(m).sort()).toEqual([
      'cognition', 'fine_motor', 'gross_motor',
      'language_comprehension', 'language_expression', 'social_emotional',
    ]);
    // cognition::7-12m 只有 1 題（max=2），其餘 2 題（max=4）
    expect(m.cognition).toBe(2);
    expect(m.language_expression).toBe(2);
    expect(m.gross_motor).toBe(4);
    expect(m.fine_motor).toBe(4);
    expect(m.language_comprehension).toBe(4);
    expect(m.social_emotional).toBe(4);
  });

  it.each(['13-24m', '25-36m', '37-48m', '49-60m', '61-72m'] as const)(
    'ageGroup %s 應有 6 個 domain 全部 maxScore=4',
    (ag) => {
      const m = getQuestionnaireMaxScores(ag);
      expect(Object.keys(m).sort()).toEqual([
        'cognition', 'fine_motor', 'gross_motor',
        'language_comprehension', 'language_expression', 'social_emotional',
      ]);
      for (const v of Object.values(m)) {
        expect(v).toBe(4);
      }
    },
  );

  it('所有 ageGroup 都能取到 (含 2-6m)', () => {
    for (const ag of AGE_GROUPS_CDSA) {
      const m = getQuestionnaireMaxScores(ag);
      expect(m).toBeDefined();
      expect(Object.keys(m).length).toBeGreaterThan(0);
    }
  });
});
