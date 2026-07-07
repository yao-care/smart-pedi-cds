import { describe, it, expect } from 'vitest';
import { allocateScores } from './questionnaire-driver';
import questionsJson from '../../../src/data/questionnaire/questions.json';

const QS = (questionsJson as { questions: { id: string; domain: string; ageGroups: string[] }[] }).questions;

describe('allocateScores', () => {
  it('每 domain 分配後的題目分數總和 = 目標', () => {
    const target = { gross_motor: 3 }; // 13-24m gross 2 題 max4
    const alloc = allocateScores('13-24m', target);
    const gmQs = QS.filter(q => q.domain === 'gross_motor' && q.ageGroups.includes('13-24m'));
    const sum = gmQs.reduce((s, q) => s + (alloc[q.id] ?? 0), 0);
    expect(sum).toBe(3);
    for (const q of gmQs) { expect(alloc[q.id]).toBeGreaterThanOrEqual(0); expect(alloc[q.id]).toBeLessThanOrEqual(2); }
  });
  it('未指定的 domain 預設滿分（避免非目標面向汙染 category）', () => {
    const alloc = allocateScores('13-24m', { gross_motor: 0 });
    const fmQs = QS.filter(q => q.domain === 'fine_motor' && q.ageGroups.includes('13-24m'));
    const sum = fmQs.reduce((s, q) => s + (alloc[q.id] ?? 0), 0);
    expect(sum).toBe(fmQs.length * 2); // 滿分
  });
});
