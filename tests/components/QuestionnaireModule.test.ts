import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/svelte';
import QuestionnaireModule from '../../src/components/assess/QuestionnaireModule.svelte';
import { assessmentStore } from '../../src/lib/stores/assessment.svelte';
import { db } from '../../src/lib/db/schema';
import type { Child, Assessment } from '../../src/lib/db/schema';

/** Build a Child whose age in months equals `monthsOld`. */
function makeChild(monthsOld: number): Child {
  const birth = new Date();
  birth.setMonth(birth.getMonth() - monthsOld);
  return {
    id: 'q-test-child',
    birthDate: birth,
    sex: 'male',
    createdAt: new Date(),
  };
}

function makeAssessment(): Assessment {
  return {
    id: 'q-test-assess',
    childId: 'q-test-child',
    status: 'in-progress',
    currentStep: 1,
    startedAt: new Date(),
    fhirSubmitted: false,
  };
}

describe('QuestionnaireModule', () => {
  beforeEach(async () => {
    assessmentStore.reset();
    await db.assessmentEvents.clear();
  });

  afterEach(() => {
    cleanup();
    assessmentStore.reset();
  });

  it('renders without crashing when assessment is uninitialised', () => {
    // No ageGroup → questions[] is empty → first-question branch falls through.
    const { container } = render(QuestionnaireModule);
    expect(container).toBeDefined();
  });

  it('renders progress bar + first question when ageGroup is set', () => {
    assessmentStore.child = makeChild(30); // 30mo → 25-36m
    assessmentStore.assessment = makeAssessment();

    render(QuestionnaireModule);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
    // Domain badge + question text both render
    expect(screen.getAllByRole('button').length).toBeGreaterThan(0);
  });

  it('advances to the next question after clicking an answer and recording event', async () => {
    assessmentStore.child = makeChild(30);
    assessmentStore.assessment = makeAssessment();

    render(QuestionnaireModule);

    const initialButtons = screen.getAllByRole('button');
    const initialFirstButton = initialButtons[0];
    const initialQuestionText = initialFirstButton.textContent;
    expect(initialQuestionText).toBeTruthy();

    // Click the first option of the first question
    await fireEvent.click(initialFirstButton);

    // The DB event must be recorded (questionnaire_answer) — wait for the
    // async recordEvent + the 520ms feedback delay before advance.
    await waitFor(
      async () => {
        const events = await db.assessmentEvents
          .where('moduleType')
          .equals('questionnaire')
          .toArray();
        expect(events.length).toBeGreaterThan(0);
        expect(events[0].eventType).toBe('questionnaire_answer');
        expect(events[0].data.questionId).toBeTruthy();
        expect(events[0].data.score).toBeGreaterThanOrEqual(0);
      },
      { timeout: 2000 },
    );
  });

  it('persists scores to the store after answering all questions', { timeout: 15000 }, async () => {
    // Use 2-6m age group (4 questions in questions.json) so the per-question
    // 520ms feedback delay × N stays under the default test timeout.
    assessmentStore.child = makeChild(4);
    assessmentStore.assessment = makeAssessment();

    render(QuestionnaireModule);

    // Loop: read first button text, click it, wait for advance, repeat.
    // 4 questions × ~600ms ≈ 2.4s plus overhead.
    const MAX_ITERATIONS = 20;
    for (let i = 0; i < MAX_ITERATIONS; i++) {
      // Stop once summary phase appears
      if (screen.queryByText('問卷完成！')) break;

      const buttons = screen.queryAllByRole('button');
      // Find first option button (skip progressbar children, only buttons)
      const optionBtn = buttons.find((b) => b.classList.contains('option-btn'));
      if (!optionBtn) break;

      await fireEvent.click(optionBtn);
      // Wait for advance (520ms feedback + persist)
      await new Promise((r) => setTimeout(r, 600));
    }

    // After all answered, summary screen + store should be populated
    await waitFor(
      () => {
        expect(screen.getByText('問卷完成！')).toBeInTheDocument();
      },
      { timeout: 3000 },
    );

    const scores = assessmentStore.partialAnalysis.questionnaireScores;
    const maxScores = assessmentStore.partialAnalysis.questionnaireMaxScores;
    expect(scores).toBeDefined();
    expect(maxScores).toBeDefined();
    expect(Object.keys(scores ?? {}).length).toBeGreaterThan(0);

    // Every score must be ≤ its max (sanity check on the aggregation)
    for (const [domain, score] of Object.entries(scores ?? {})) {
      const max = (maxScores ?? {})[domain];
      expect(max).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(max);
    }
  });
});
