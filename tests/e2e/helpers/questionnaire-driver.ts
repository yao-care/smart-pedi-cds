import type { Page } from '@playwright/test';
import questionsJson from '../../../src/data/questionnaire/questions.json' with { type: 'json' };
import type { AgeGroupCDSA } from '../../../src/lib/utils/age-groups';

interface Q { id: string; domain: string; ageGroups: string[]; options: { score: number }[]; }
const QUESTIONS = (questionsJson as { questions: Q[] }).questions;

function questionsFor(ageGroup: AgeGroupCDSA): Q[] {
  return QUESTIONS.filter(q => q.ageGroups.includes(ageGroup));
}

/** 把每 domain 目標總分拆到該 domain 的題目（每題上限 2）。未指定的 domain 給滿分。 */
export function allocateScores(
  ageGroup: AgeGroupCDSA, targetByDomain: Record<string, number>,
): Record<string, number> {
  const qs = questionsFor(ageGroup);
  const byDomain: Record<string, Q[]> = {};
  for (const q of qs) (byDomain[q.domain] ??= []).push(q);

  const alloc: Record<string, number> = {};
  for (const [domain, domainQs] of Object.entries(byDomain)) {
    const perMax = domainQs.map(q => Math.max(...q.options.map(o => o.score))); // 每題 2
    const fullMax = perMax.reduce((a, b) => a + b, 0);
    let remaining = domain in targetByDomain ? targetByDomain[domain] : fullMax;
    domainQs.forEach((q, i) => {
      const take = Math.max(0, Math.min(perMax[i], remaining));
      alloc[q.id] = take;
      remaining -= take;
    });
  }
  return alloc;
}

/** 依序作答直到摘要出現。點 data-score 對應按鈕，等 520ms 回饋動畫。 */
export async function answerQuestionnaire(
  page: Page, ageGroup: AgeGroupCDSA, targetByDomain: Record<string, number>,
): Promise<void> {
  const qs = questionsFor(ageGroup);
  const alloc = allocateScores(ageGroup, targetByDomain);
  for (let i = 0; i < qs.length; i++) {
    await page.locator('.option-btn').first().waitFor({ state: 'visible', timeout: 10_000 });
    const score = alloc[qs[i].id];
    await page.locator(`.option-btn[data-score="${score}"]`).first().click();
    await page.waitForTimeout(600); // 520ms 回饋 + 進位
  }
  await page.getByText('問卷完成！').waitFor({ timeout: 10_000 });
}
