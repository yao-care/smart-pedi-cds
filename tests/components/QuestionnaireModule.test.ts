import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import QuestionnaireModule from '../../src/components/assess/QuestionnaireModule.svelte';

describe('QuestionnaireModule', () => {
  it('renders without crashing when assessment is uninitialised', () => {
    // With no assessmentStore.ageGroup, the module renders nothing or empty state.
    // Just confirm import + render does not throw.
    const { container } = render(QuestionnaireModule);
    expect(container).toBeDefined();
  });
});
