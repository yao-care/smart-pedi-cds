export const AGE_GROUPS_CDSA = [
  '2-6m', '7-12m', '13-24m', '25-36m', '37-48m', '49-60m', '61-72m',
] as const;
export type AgeGroupCDSA = typeof AGE_GROUPS_CDSA[number];

export const AGE_GROUP_LABELS: Record<AgeGroupCDSA, string> = {
  '2-6m': '2-6 個月',
  '7-12m': '7-12 個月',
  '13-24m': '13-24 個月',
  '25-36m': '25-36 個月',
  '37-48m': '37-48 個月',
  '49-60m': '49-60 個月',
  '61-72m': '61-72 個月',
};

/** Calculate age in months from birth date to a reference time (defaults to now). */
export function ageInMonthsAt(birthDate: string | Date, atTime: Date): number {
  const birth = typeof birthDate === 'string' ? new Date(birthDate) : birthDate;
  const months = (atTime.getFullYear() - birth.getFullYear()) * 12 + (atTime.getMonth() - birth.getMonth());
  const dayAdjust = atTime.getDate() < birth.getDate() ? -1 : 0;
  return Math.max(0, months + dayAdjust);
}

/** Calculate age in months from birth date to now. */
export function ageInMonths(birthDate: string | Date): number {
  return ageInMonthsAt(birthDate, new Date());
}

/** Map months → CDSA age group bucket. */
function monthsToAgeGroup(months: number): AgeGroupCDSA {
  if (months <= 6) return '2-6m';
  if (months <= 12) return '7-12m';
  if (months <= 24) return '13-24m';
  if (months <= 36) return '25-36m';
  if (months <= 48) return '37-48m';
  if (months <= 60) return '49-60m';
  return '61-72m';
}

/** Determine CDSA age group from birth date (now). */
export function ageGroupCDSA(birthDate: string | Date): AgeGroupCDSA {
  return monthsToAgeGroup(ageInMonths(birthDate));
}

/** Determine CDSA age group at a specific moment (for retroactive recomputation
 *  of historical assessments — birthDate + Assessment.completedAt → ageGroup
 *  at the time of assessment, not at "now"). Spec §13.5. */
export function ageGroupCDSAAt(birthDate: string | Date, atTime: Date): AgeGroupCDSA {
  return monthsToAgeGroup(ageInMonthsAt(birthDate, atTime));
}

/** Check if child is within CDSA target range (0-72 months) */
export function isEligible(birthDate: string | Date): boolean {
  const months = ageInMonths(birthDate);
  return months >= 0 && months <= 72;
}

/** Get instruction complexity level for an age group */
export function instructionLevel(ageGroup: AgeGroupCDSA): 'none' | 'single_verb' | 'verb_object' | 'verb_adj_object' | 'compound' {
  switch (ageGroup) {
    case '2-6m':
    case '7-12m': return 'none';
    case '13-24m': return 'single_verb';
    case '25-36m': return 'verb_object';
    case '37-48m': return 'verb_adj_object';
    case '49-60m':
    case '61-72m': return 'compound';
  }
}
