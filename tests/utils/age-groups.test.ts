import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ageInMonths,
  ageGroupCDSA,
  isEligible,
  instructionLevel,
  AGE_GROUPS_CDSA,
} from '../../src/lib/utils/age-groups';

describe('age-groups', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-14T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('ageInMonths', () => {
    it('returns 0 for today', () => {
      expect(ageInMonths(new Date('2026-05-14'))).toBe(0);
    });

    it('returns whole month difference when day matches', () => {
      expect(ageInMonths(new Date('2025-05-14'))).toBe(12);
    });

    it('subtracts a month if current day is before birth day', () => {
      expect(ageInMonths(new Date('2025-05-20'))).toBe(11);
    });

    it('accepts ISO string input', () => {
      expect(ageInMonths('2024-05-14')).toBe(24);
    });

    it('never returns negative for future birth date', () => {
      expect(ageInMonths(new Date('2027-05-14'))).toBe(0);
    });
  });

  describe('ageGroupCDSA', () => {
    it('maps each boundary to correct group', () => {
      const cases: Array<[Date, typeof AGE_GROUPS_CDSA[number]]> = [
        [new Date('2026-03-14'), '2-6m'],
        [new Date('2025-09-14'), '7-12m'],
        [new Date('2024-12-14'), '13-24m'],
        [new Date('2023-12-14'), '25-36m'],
        [new Date('2022-12-14'), '37-48m'],
        [new Date('2021-12-14'), '49-60m'],
        [new Date('2020-12-14'), '61-72m'],
      ];
      for (const [birth, expected] of cases) {
        expect(ageGroupCDSA(birth)).toBe(expected);
      }
    });

    it('returns 61-72m for ages beyond 72 months', () => {
      expect(ageGroupCDSA(new Date('2015-05-14'))).toBe('61-72m');
    });
  });

  describe('isEligible', () => {
    it('true for 0-72 months', () => {
      expect(isEligible(new Date('2026-05-14'))).toBe(true);
      expect(isEligible(new Date('2020-06-14'))).toBe(true);
    });

    it('false for over 72 months', () => {
      expect(isEligible(new Date('2018-05-14'))).toBe(false);
    });
  });

  describe('instructionLevel', () => {
    it('returns expected complexity per group', () => {
      expect(instructionLevel('2-6m')).toBe('none');
      expect(instructionLevel('7-12m')).toBe('none');
      expect(instructionLevel('13-24m')).toBe('single_verb');
      expect(instructionLevel('25-36m')).toBe('verb_object');
      expect(instructionLevel('37-48m')).toBe('verb_adj_object');
      expect(instructionLevel('49-60m')).toBe('compound');
      expect(instructionLevel('61-72m')).toBe('compound');
    });
  });
});
