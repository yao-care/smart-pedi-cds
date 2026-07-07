import rawTable18 from '../../../src/data/baselines/asq3-table18-raw.json';
import type { AgeGroupCDSA } from '../../../src/lib/utils/age-groups';

type Area = 'communication' | 'gross_motor' | 'fine_motor' | 'problem_solving' | 'personal_social';

const DOMAIN_TO_AREA: Record<string, Area> = {
  cognition: 'problem_solving',
  fine_motor: 'fine_motor',
  gross_motor: 'gross_motor',
  language_comprehension: 'communication',
  language_expression: 'communication',
  social_emotional: 'personal_social',
};

const AGE_TO_INTERVAL: Record<AgeGroupCDSA, string> = {
  '2-6m': '4', '7-12m': '10', '13-24m': '18', '25-36m': '30',
  '37-48m': '42', '49-60m': '54', '61-72m': '60',
};

interface RawCell { mean: number; sd: number; cutoff1Sd: number; cutoff15Sd: number; cutoff2Sd: number; }
const INTERVALS = (rawTable18 as { intervals: Record<string, Record<Area, RawCell>> }).intervals;

const ASQ3_MAX = 60;

export function expectedQuestionnaireZ(
  domain: string, ageGroup: AgeGroupCDSA, score: number, maxScore: number,
): number {
  const area = DOMAIN_TO_AREA[domain];
  const interval = AGE_TO_INTERVAL[ageGroup];
  const cell = INTERVALS[interval]?.[area];
  if (!cell) throw new Error(`no norm cell: ${domain}/${ageGroup}`);
  const scale = maxScore / ASQ3_MAX;
  const mean = cell.mean * scale;
  const sd = cell.sd * scale;
  return (score - mean) / sd;
}

export function categoryFromZ(z: number): 'normal' | 'monitor' | 'refer' {
  if (z <= -2) return 'refer';
  if (z <= -1) return 'monitor';
  return 'normal';
}
