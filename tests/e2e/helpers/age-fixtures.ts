import { AGE_GROUPS_CDSA, type AgeGroupCDSA } from '../../../src/lib/utils/age-groups';

export const ALL_AGE_GROUPS: readonly AgeGroupCDSA[] = AGE_GROUPS_CDSA;

/** 各年齡層取一個「桶中央」月齡，避免落在邊界上。 */
export const AGE_GROUP_REF_MONTHS: Record<AgeGroupCDSA, number> = {
  '2-6m': 4, '7-12m': 10, '13-24m': 18, '25-36m': 30,
  '37-48m': 42, '49-60m': 54, '61-72m': 66,
};

/** 回推使 ageGroupCDSA() 落在指定桶的出生日期（YYYY-MM-DD）。
 *  日固定取 15 號，避開月底 + 月初的進位邊界。 */
export function birthDateForAgeGroup(ageGroup: AgeGroupCDSA, now: Date = new Date()): string {
  const months = AGE_GROUP_REF_MONTHS[ageGroup];
  const d = new Date(now.getFullYear(), now.getMonth() - months, 15);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}
