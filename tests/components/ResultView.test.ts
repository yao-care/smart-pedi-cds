import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import ResultView from '../../src/components/assess/ResultView.svelte';

describe('ResultView', () => {
  it('shows computing placeholder before triage result is ready', () => {
    render(ResultView);
    // With no assessmentStore.ageGroup, the $effect early-returns and
    // triageResult stays null, so the loading state shows.
    expect(screen.getByText(/正在產生評估結果/)).toBeInTheDocument();
  });
});
