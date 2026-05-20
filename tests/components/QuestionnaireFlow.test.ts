import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/svelte';
import { tick } from 'svelte';
import QuestionnaireModule from '../../src/components/assess/QuestionnaireModule.svelte';
import { assessmentStore } from '../../src/lib/stores/assessment.svelte';
import { db } from '../../src/lib/db/schema';
import expectedDomainsMap from '../../src/lib/data/expected-questionnaire-domains.generated.json';

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
}

const AGE_BIRTHDATES: Record<string, string> = {
  '2-6m':   isoDaysAgo(30 * 4),
  '7-12m':  isoDaysAgo(30 * 10),
  '13-24m': isoDaysAgo(30 * 18),
  '25-36m': isoDaysAgo(30 * 30),
  '37-48m': isoDaysAgo(30 * 42),
  '49-60m': isoDaysAgo(30 * 54),
  '61-72m': isoDaysAgo(30 * 66),
};

describe('QuestionnaireModule emission per ageGroup', () => {
  beforeEach(async () => {
    // mute dev-warn console.warn to keep test output clean
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await db.assessmentEvents.clear();
    await db.assessments.clear();
    await db.children.clear();
    assessmentStore.reset();
    // Activate fake timers only after async DB setup is complete
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    cleanup();
    assessmentStore.reset();
  });

  for (const ag of Object.keys(AGE_BIRTHDATES)) {
    it(`emits all applicable domains for ${ag}`, { timeout: 30000 }, async () => {
      // startNew must run with real timers (uses IndexedDB)
      // beforeEach already enabled fake timers; restore to real for this async init
      vi.useRealTimers();
      await assessmentStore.startNew({
        nickName: 'test',
        birthDate: AGE_BIRTHDATES[ag],
        gender: 'male',
      });
      expect(assessmentStore.ageGroup).toBe(ag);
      // Move to questionnaire step
      assessmentStore.currentStepIndex = 1;
      // Re-enable fake timers for the UI interaction loop
      vi.useFakeTimers();

      render(QuestionnaireModule);
      await tick();

      // Answer every question with max score (data-score="2")
      let safety = 80;
      while (safety-- > 0) {
        const maxBtn = document.querySelector<HTMLButtonElement>('button[data-score="2"]');
        if (!maxBtn) break;
        // If button is disabled, advance time and retry
        if (maxBtn.disabled) {
          await vi.advanceTimersByTimeAsync(100);
          await tick();
          continue;
        }
        await fireEvent.click(maxBtn);
        // Advance past the 520ms feedback delay
        await vi.advanceTimersByTimeAsync(550);
        await tick();
      }

      const expected = (expectedDomainsMap as Record<string, string[]>)[ag] ?? [];
      const scores = assessmentStore.partialAnalysis.questionnaireScores ?? {};
      const maxScores = assessmentStore.partialAnalysis.questionnaireMaxScores ?? {};

      // All applicable domains must be scored AND at max (all-yes answers)
      for (const d of expected) {
        expect(scores, `domain '${d}' should be in scores for ${ag}`).toHaveProperty(d);
        expect(scores[d], `domain '${d}' score should equal max for ${ag}`).toBe(maxScores[d]);
      }
      // Every applicable domain must appear in scores (but scores may include
      // additional domains from questions added after the map was generated)
      for (const d of expected) {
        expect(Object.keys(scores)).toContain(d);
      }
    });
  }
});
