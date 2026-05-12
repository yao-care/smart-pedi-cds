export type AgeGroup = 'infant' | 'toddler' | 'preschool';

/**
 * Determine age group from birth date.
 * infant: 0-1 year, toddler: 1-3 years, preschool: 3-6 years
 */
export function ageGroup(birthDate: string | Date): AgeGroup {
  const birth = typeof birthDate === 'string' ? new Date(birthDate) : birthDate;
  const now = new Date();
  const ageMs = now.getTime() - birth.getTime();
  const ageYears = ageMs / (365.25 * 24 * 60 * 60 * 1000);

  if (ageYears < 1) return 'infant';
  if (ageYears < 3) return 'toddler';
  return 'preschool';
}

/**
 * Format date/time in zh-TW locale.
 */
export function formatDateTime(date: Date, locale = 'zh-TW'): string {
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

/**
 * Format date only (no time) in zh-TW locale.
 */
export function formatDate(date: Date, locale = 'zh-TW'): string {
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * Calculate whole days between two dates.
 */
export function daysBetween(a: Date, b: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.floor(Math.abs(b.getTime() - a.getTime()) / msPerDay);
}

/**
 * Return a Date that is `hours` hours before now.
 */
export function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}
