import { describe, it, expect } from 'vitest';
import questionsData from '../../src/data/questionnaire/questions.json';
import expectedDomainsMap from '../../src/lib/data/expected-questionnaire-domains.generated.json';

interface Question {
  id: string;
  domain: string;
  ageGroups: string[];
  clinicallyReviewed?: boolean;
  source?: string;
}

describe('questionnaire coverage per ageGroup × applicable domain', () => {
  const questions = (questionsData.questions as Question[]);
  for (const [ageGroup, applicableDomains] of Object.entries(expectedDomainsMap)) {
    for (const domain of applicableDomains as string[]) {
      it(`${ageGroup} × ${domain} has >= 2 questions`, () => {
        const count = questions.filter(q =>
          q.ageGroups.includes(ageGroup) && q.domain === domain
        ).length;
        expect(count).toBeGreaterThanOrEqual(2);
      });
    }
  }

  it('all questions have clinicallyReviewed and source fields', () => {
    expect(questions.length).toBe(44);
    for (const item of questions) {
      expect(item).toHaveProperty('clinicallyReviewed');
      expect(item).toHaveProperty('source');
    }
  });
});

describe('clinical review record integrity', () => {
  const questions = (questionsData.questions as Question[]);

  it('has no duplicate question IDs', () => {
    const ids = questions.map((q) => q.id);
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    expect(dupes).toEqual([]);
  });

  it('every question is clinically reviewed', () => {
    for (const q of questions) {
      expect(q.clinicallyReviewed).toBe(true);
    }
  });

  interface ClinicalReviewMeta {
    reviewed: boolean;
    reviewedAt: string;
    scope: string;
    reviewer: string;
    basis: string;
  }

  it('records a top-level clinical review metadata block', () => {
    const meta = (questionsData as { clinicalReview?: ClinicalReviewMeta }).clinicalReview;
    expect(meta).toBeDefined();
    expect(meta?.reviewed).toBe(true);
    expect(meta?.reviewedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(meta?.reviewer.length).toBeGreaterThan(0);
  });
});
