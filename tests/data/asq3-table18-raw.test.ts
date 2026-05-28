import { describe, it, expect } from 'vitest';
import raw from '../../src/data/baselines/asq3-table18-raw.json';

/**
 * ASQ-3 Table 18 raw data — cell-level consistency守門。
 *
 * 為什麼這個測試存在：ASQ-3 Table 18 來自 PDF 圖檔（page 171），靠 OCR 抄錄 105+ 個臨床數字。
 * OCR 錯一個就會讓整個問卷常模計算偏移。因此每 cell 同時抄錄 mean、sd、與三個 reported cutoff
 * （1SD/1.5SD/2SD），用 |mean - k*sd - reportedCutoffK| < 0.05 三個關係互相驗證。
 *
 * ASQ-3 官方規則：cutoff_k = mean - k*SD，monitoring zone = 1~2 SD 之間。
 * 若三個關係都成立，代表 mean/sd/三個 cutoffs 至少自洽（強 self-consistency）。
 * 不能 100% 排除「mean 和 sd 一起抄錯但巧合自洽」這種極端情況，但機率極低。
 *
 * 任一 cell 失敗 → 重新核對 PDF page 171（已存 PDF：
 * https://agesandstages.com/wp-content/uploads/2019/08/ASQ-3-Technical-Appendix_web.pdf）。
 *
 * spec: docs/superpowers/specs/2026-05-28-questionnaire-norms-design.md §13.4
 */

const TOLERANCE = 0.05; // ASQ-3 PDF 數字四捨五入到 2 位，誤差容忍 0.05

const ASQ3_AREAS = ['communication', 'gross_motor', 'fine_motor', 'problem_solving', 'personal_social'] as const;
const EXPECTED_INTERVALS = ['4', '10', '18', '30', '42', '54', '60'] as const;

describe('ASQ-3 Table 18 raw — cell-level OCR consistency', () => {
  it('檔內 _meta 有 source 與 ageGroupMapping', () => {
    expect(raw._meta.source).toMatch(/ASQ-3.*Table 18/);
    expect(raw._meta.maxScore).toBe(60);
    expect(raw._meta.ageGroupMapping).toBeDefined();
  });

  it('涵蓋 7 個本系統 ageGroup 對應的 ASQ-3 interval', () => {
    const intervals = Object.keys(raw.intervals).sort((a, b) => Number(a) - Number(b));
    expect(intervals).toEqual([...EXPECTED_INTERVALS].sort((a, b) => Number(a) - Number(b)));
  });

  describe.each(EXPECTED_INTERVALS)('interval %s month', (interval) => {
    const intervalData = (raw.intervals as Record<string, Record<string, {
      mean: number; sd: number; cutoff1Sd: number; cutoff15Sd: number; cutoff2Sd: number;
    }>>)[interval];

    it(`含 5 個 ASQ-3 area`, () => {
      expect(Object.keys(intervalData).sort()).toEqual([...ASQ3_AREAS].sort());
    });

    describe.each(ASQ3_AREAS)('%s', (area) => {
      const cell = intervalData[area];

      it('mean 在合理範圍 (30-60)', () => {
        // ASQ-3 設計目標 mean ≈ 50，實測 30-60 之間
        expect(cell.mean).toBeGreaterThanOrEqual(30);
        expect(cell.mean).toBeLessThanOrEqual(60);
      });

      it('sd 在合理範圍 (5-20)', () => {
        // ASQ-3 各面向 SD 多為 8-15，極端 6-18
        expect(cell.sd).toBeGreaterThanOrEqual(5);
        expect(cell.sd).toBeLessThanOrEqual(20);
      });

      it('cutoff1Sd ≈ mean - 1*sd (tolerance 0.05)', () => {
        const expected = cell.mean - 1 * cell.sd;
        expect(Math.abs(cell.cutoff1Sd - expected)).toBeLessThanOrEqual(TOLERANCE);
      });

      it('cutoff15Sd ≈ mean - 1.5*sd (tolerance 0.05)', () => {
        const expected = cell.mean - 1.5 * cell.sd;
        expect(Math.abs(cell.cutoff15Sd - expected)).toBeLessThanOrEqual(TOLERANCE);
      });

      it('cutoff2Sd ≈ mean - 2*sd (tolerance 0.05)', () => {
        const expected = cell.mean - 2 * cell.sd;
        expect(Math.abs(cell.cutoff2Sd - expected)).toBeLessThanOrEqual(TOLERANCE);
      });
    });
  });
});
