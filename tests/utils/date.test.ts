import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ageGroup,
  formatDate,
  formatDateTime,
  daysBetween,
  hoursAgo,
} from '../../src/lib/utils/date';

describe('date utils', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-14T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('ageGroup', () => {
    it('returns infant for <1 year', () => {
      expect(ageGroup(new Date('2025-12-01'))).toBe('infant');
    });

    it('returns toddler for 1-3 years', () => {
      expect(ageGroup(new Date('2024-05-01'))).toBe('toddler');
    });

    it('returns preschool for >=3 years', () => {
      expect(ageGroup(new Date('2022-05-01'))).toBe('preschool');
    });

    it('accepts string input', () => {
      expect(ageGroup('2024-05-14')).toBe('toddler');
    });
  });

  describe('formatDate', () => {
    it('formats in zh-TW with leading zeros', () => {
      const out = formatDate(new Date('2026-03-09T12:00:00Z'));
      expect(out).toMatch(/2026/);
      expect(out).toMatch(/03/);
      expect(out).toMatch(/09/);
    });
  });

  describe('formatDateTime', () => {
    it('includes hour and minute', () => {
      const out = formatDateTime(new Date('2026-03-09T12:34:00Z'));
      expect(out).toMatch(/\d{2}:\d{2}/);
    });
  });

  describe('daysBetween', () => {
    it('counts whole days regardless of order', () => {
      const a = new Date('2026-05-14');
      const b = new Date('2026-05-17');
      expect(daysBetween(a, b)).toBe(3);
      expect(daysBetween(b, a)).toBe(3);
    });
  });

  describe('hoursAgo', () => {
    it('returns Date in past', () => {
      const past = hoursAgo(2);
      const diff = Date.now() - past.getTime();
      expect(diff).toBeCloseTo(2 * 60 * 60 * 1000, -2);
    });
  });
});
