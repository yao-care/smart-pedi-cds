import questionsJson from '../../src/data/questionnaire/questions.json' with { type: 'json' };
import { AGE_GROUPS_CDSA, type AgeGroupCDSA } from '../../src/lib/utils/age-groups';

export interface QUnit { domain: string; age: AgeGroupCDSA; score: number; maxScore: number; }
export interface ModuleCell { module: 'game' | 'voice' | 'video' | 'drawing'; age: AgeGroupCDSA; }

interface Q { domain: string; ageGroups: string[]; options: { score: number }[]; }
const QUESTIONS = (questionsJson as { questions: Q[] }).questions;

/** (age → domain → maxScore)；只含有題格。 */
function maxScoreMap(): Record<string, Record<string, number>> {
  const map: Record<string, Record<string, number>> = {};
  for (const q of QUESTIONS) {
    const itemMax = Math.max(...q.options.map(o => o.score));
    for (const ag of q.ageGroups) {
      (map[ag] ??= {})[q.domain] = (map[ag][q.domain] ?? 0) + itemMax;
    }
  }
  return map;
}

export function expectedQuestionnaireUnits(): QUnit[] {
  const map = maxScoreMap();
  const units: QUnit[] = [];
  for (const age of AGE_GROUPS_CDSA) {
    const byDomain = map[age] ?? {};
    for (const [domain, maxScore] of Object.entries(byDomain)) {
      for (let score = 0; score <= maxScore; score++) {
        units.push({ domain, age, score, maxScore });
      }
    }
  }
  return units;
}

/** voice 在 instructionLevel==='none'（2-6m/7-12m）被 skip；其餘模組全齡。 */
export function expectedActiveModuleCells(): ModuleCell[] {
  const cells: ModuleCell[] = [];
  const voiceSkip = new Set<AgeGroupCDSA>(['2-6m', '7-12m']);
  for (const age of AGE_GROUPS_CDSA) {
    cells.push({ module: 'game', age });
    cells.push({ module: 'video', age });
    cells.push({ module: 'drawing', age });
    if (!voiceSkip.has(age)) cells.push({ module: 'voice', age });
  }
  return cells;
}
