import { describe, it, expect } from 'vitest';
import { birthDateForAgeGroup, ALL_AGE_GROUPS } from './age-fixtures';
import { ageGroupCDSA } from '../../../src/lib/utils/age-groups';

describe('birthDateForAgeGroup', () => {
  it('每個年齡層回推的生日都映射回同一 ageGroup', () => {
    const now = new Date('2026-07-07T00:00:00Z');
    for (const ag of ALL_AGE_GROUPS) {
      const birth = birthDateForAgeGroup(ag, now);
      expect(ageGroupCDSA(new Date(birth + 'T00:00:00Z'))).toBe(ag);
    }
  });
  it('涵蓋 7 個年齡層', () => {
    expect(ALL_AGE_GROUPS).toHaveLength(7);
  });
});
