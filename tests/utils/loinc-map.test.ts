import { describe, it, expect } from 'vitest';
import {
  INDICATOR_NAMES,
  LOINC_CODES,
  indicatorByLoinc,
  loincByIndicator,
  INDICATOR_LABELS,
  INDICATOR_UNITS,
} from '../../src/lib/utils/loinc-map';

describe('loinc-map', () => {
  it('every indicator has a LOINC code', () => {
    for (const name of INDICATOR_NAMES) {
      expect(LOINC_CODES[name]).toMatch(/^\d+-\d$/);
    }
  });

  it('every indicator has a label and unit', () => {
    for (const name of INDICATOR_NAMES) {
      expect(INDICATOR_LABELS[name]).toBeTruthy();
      expect(INDICATOR_UNITS[name]).toBeTruthy();
    }
  });

  describe('indicatorByLoinc', () => {
    it('round-trips with loincByIndicator', () => {
      for (const name of INDICATOR_NAMES) {
        const code = loincByIndicator(name)!;
        expect(indicatorByLoinc(code)).toBe(name);
      }
    });

    it('returns undefined for unknown code', () => {
      expect(indicatorByLoinc('00000-0')).toBeUndefined();
    });
  });

  describe('loincByIndicator', () => {
    it('returns code for known indicator', () => {
      expect(loincByIndicator('heart_rate')).toBe('8867-4');
    });

    it('returns undefined for unknown indicator', () => {
      expect(loincByIndicator('xyz')).toBeUndefined();
    });
  });
});
