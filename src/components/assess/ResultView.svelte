<script lang="ts">
  import { assessmentStore } from '../../lib/stores/assessment.svelte';
  import { authStore } from '../../lib/stores/auth.svelte';
  import { setTriageResult } from '../../lib/db/assessments';
  import { submitAssessmentToFhir } from '../../lib/fhir/cdsa-submit';
  import RadarChart from './RadarChart.svelte';
  import EducationMatch from './EducationMatch.svelte';

  interface Props {
    triageResult: {
      category: 'normal' | 'monitor' | 'refer';
      confidence: number;
      summary: string;
      anomalyCount: number;
      details: Array<{
        domain: string;
        metric: string;
        value: number;
        zScore: number | null;
        isAnomaly: boolean;
      }>;
    };
  }

  let { triageResult }: Props = $props();

  let fhirSubmitting = $state(false);
  let fhirSubmitted = $state(false);
  let fhirError = $state<string | null>(null);

  const categoryLabels: Record<string, string> = {
    normal: '正常',
    monitor: '追蹤觀察',
    refer: '建議轉介',
  };

  const categoryColors: Record<string, string> = {
    normal: 'var(--color-risk-normal)',
    monitor: 'var(--color-risk-warning)',
    refer: 'var(--color-risk-critical)',
  };

  const categoryBgColors: Record<string, string> = {
    normal: 'var(--color-risk-normal-bg)',
    monitor: 'var(--color-risk-warning-bg)',
    refer: 'var(--color-risk-critical-bg)',
  };

  // Group details by domain for radar chart
  const domainScores = $derived.by(() => {
    const scores: Record<string, { total: number; count: number; hasAnomaly: boolean }> = {};
    for (const d of triageResult.details) {
      if (!scores[d.domain]) {
        scores[d.domain] = { total: 0, count: 0, hasAnomaly: false };
      }
      // Normalize value to 0-100 scale for display
      const normalizedValue = d.zScore !== null
        ? Math.max(0, Math.min(100, 50 + d.zScore * 15))
        : d.value * 100;
      scores[d.domain].total += normalizedValue;
      scores[d.domain].count++;
      if (d.isAnomaly) scores[d.domain].hasAnomaly = true;
    }
    return Object.entries(scores).map(([domain, s]) => ({
      domain,
      score: Math.round(s.total / s.count),
      hasAnomaly: s.hasAnomaly,
    }));
  });

  // Anomaly domains for education matching
  const anomalyDomains = $derived(
    triageResult.details.filter(d => d.isAnomaly).map(d => d.domain)
  );

  async function saveResult() {
    if (!assessmentStore.assessment) return;
    await setTriageResult(assessmentStore.assessment.id, {
      category: triageResult.category,
      confidence: triageResult.confidence,
      summary: triageResult.summary,
    });
    await assessmentStore.complete();
  }

  async function submitToFhir() {
    if (!assessmentStore.assessment || !assessmentStore.child || !authStore.isAuthenticated) return;
    fhirSubmitting = true;
    fhirError = null;
    try {
      const result = await submitAssessmentToFhir(
        assessmentStore.assessment,
        assessmentStore.child.id,
        triageResult,
      );
      if (result.success) {
        fhirSubmitted = true;
      } else {
        fhirError = result.error ?? '傳送失敗';
      }
    } catch {
      fhirError = '傳送失敗，請稍後重試';
    } finally {
      fhirSubmitting = false;
    }
  }

  // Auto-save on mount
  $effect(() => {
    saveResult();
  });
</script>

<div class="result-view">
  <div class="disclaimer" role="alert">
    本評估結果僅供參考，不構成醫療診斷。如有疑慮，請諮詢專業兒科醫師。
  </div>

  <div
    class="triage-card"
    style="background: {categoryBgColors[triageResult.category]}; border-color: {categoryColors[triageResult.category]};"
  >
    <h2 style="color: {categoryColors[triageResult.category]};">
      {categoryLabels[triageResult.category]}
    </h2>
    <p class="confidence">信心度 {Math.round(triageResult.confidence * 100)}%</p>
    <p class="summary">{triageResult.summary}</p>
  </div>

  {#if domainScores.length > 0}
    <section class="radar-section" aria-label="各面向評估結果">
      <h3>各面向評估</h3>
      <RadarChart data={domainScores} />
    </section>
  {/if}

  <section class="details-section" aria-label="詳細指標">
    <h3>詳細指標</h3>
    <div class="details-grid">
      {#each triageResult.details as detail}
        <div class="detail-item" class:anomaly={detail.isAnomaly}>
          <span class="detail-domain">{detail.domain}</span>
          <span class="detail-metric">{detail.metric}</span>
          <span class="detail-value">{typeof detail.value === 'number' ? detail.value.toFixed(2) : detail.value}</span>
          {#if detail.isAnomaly}
            <span class="anomaly-badge">偏離</span>
          {/if}
        </div>
      {/each}
    </div>
  </section>

  {#if anomalyDomains.length > 0}
    <section class="education-section" aria-label="衛教建議">
      <h3>建議閱讀</h3>
      <EducationMatch domains={[...new Set(anomalyDomains)]} />
    </section>
  {/if}

  <div class="result-actions">
    {#if authStore.isAuthenticated && !fhirSubmitted}
      <button class="btn-fhir" onclick={submitToFhir} disabled={fhirSubmitting}>
        {fhirSubmitting ? '傳送中…' : '傳送結果至醫院'}
      </button>
    {:else if fhirSubmitted}
      <p class="fhir-success">已傳送至醫院 FHIR Server</p>
    {/if}

    {#if fhirError}
      <p class="fhir-error">{fhirError}</p>
    {/if}

    <a href="/smart-pedi-cds/" class="btn-home">返回首頁</a>
  </div>
</div>

<style>
  .result-view {
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
  }

  /* Disclaimer banner */
  .disclaimer {
    padding: var(--space-3) var(--space-4);
    background: var(--color-risk-warning-bg);
    border: 1px solid var(--color-risk-warning);
    border-radius: var(--radius-md);
    font-size: var(--text-xs);
    color: var(--color-risk-warning);
    text-align: center;
    font-weight: var(--font-medium);
  }

  /* Triage card */
  .triage-card {
    padding: var(--space-7);
    border: 2px solid;
    border-radius: var(--radius-lg);
    text-align: center;
  }

  .triage-card h2 {
    font-size: var(--text-3xl);
    margin-bottom: var(--space-2);
  }

  .confidence {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    margin-bottom: var(--space-3);
  }

  .summary {
    font-size: var(--text-base);
    color: var(--color-text-base);
    line-height: var(--lh-base);
  }

  /* Radar section */
  .radar-section {
    text-align: center;
  }

  .radar-section h3 {
    font-size: var(--text-lg);
    margin-bottom: var(--space-4);
  }

  /* Details section */
  .details-section h3 {
    font-size: var(--text-lg);
    margin-bottom: var(--space-4);
  }

  .details-grid {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .detail-item {
    display: grid;
    grid-template-columns: 1fr 1fr auto auto;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    background: var(--bg-surface);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-md);
    font-size: var(--text-xs);
  }

  .detail-item.anomaly {
    border-color: var(--color-risk-critical);
    background: var(--color-risk-critical-bg);
  }

  .detail-domain {
    font-weight: var(--font-medium);
    color: var(--color-text-base);
  }

  .detail-metric {
    color: var(--color-text-muted);
  }

  .detail-value {
    font-family: var(--font-mono);
    color: var(--color-text-base);
    text-align: right;
  }

  .anomaly-badge {
    display: inline-block;
    padding: var(--space-1) var(--space-2);
    background: var(--color-risk-critical);
    color: #fff;
    border-radius: var(--radius-full);
    font-size: 14px;
    font-weight: var(--font-medium);
    line-height: 1;
  }

  /* Education section */
  .education-section h3 {
    font-size: var(--text-lg);
    margin-bottom: var(--space-4);
  }

  /* Action buttons */
  .result-actions {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-4);
    padding-top: var(--space-4);
    border-top: 1px solid var(--border-default);
  }

  .btn-fhir {
    padding: var(--space-3) var(--space-7);
    background: var(--color-accent);
    color: #fff;
    border: none;
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    cursor: pointer;
    min-height: 48px;
    min-width: 200px;
    transition: background 0.2s;
  }

  .btn-fhir:hover:not(:disabled) {
    background: var(--color-accent-hover);
  }

  .btn-fhir:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .fhir-success {
    font-size: var(--text-sm);
    color: var(--color-risk-normal);
    font-weight: var(--font-medium);
  }

  .fhir-error {
    font-size: var(--text-sm);
    color: var(--color-risk-critical);
    font-weight: var(--font-medium);
  }

  .btn-home {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-3) var(--space-7);
    background: var(--bg-surface);
    color: var(--color-text-base);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
    text-decoration: none;
    min-height: 48px;
    min-width: 200px;
    transition: border-color 0.2s;
  }

  .btn-home:hover {
    border-color: var(--color-accent);
  }
</style>
