<script lang="ts">
  import { getAllChildren, getAssessmentsForChild, getChild } from '../../lib/db/assessments';
  import { ageInMonths } from '../../lib/utils/age-groups';
  import type { Assessment, Child } from '../../lib/db/schema';
  import RadarChart from './RadarChart.svelte';
  import AssessmentPdfReport from './AssessmentPdfReport.svelte';

  interface ChildWithAssessments {
    child: Child;
    assessments: Assessment[];
  }

  let loading = $state(true);
  let childrenData = $state<ChildWithAssessments[]>([]);
  let expandedAssessmentId = $state<string | null>(null);
  let expandedChild = $state<Child | null>(null);

  const categoryLabels: Record<string, string> = {
    normal: '正常',
    monitor: '追蹤觀察',
    refer: '建議轉介',
  };

  const categoryClasses: Record<string, string> = {
    normal: 'badge-normal',
    monitor: 'badge-monitor',
    refer: 'badge-refer',
  };

  function formatDate(d: Date | string): string {
    const date = typeof d === 'string' ? new Date(d) : d;
    return date.toLocaleDateString('zh-TW', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  }

  function abbreviateId(id: string): string {
    return id.length > 8 ? id.slice(0, 8) + '...' : id;
  }

  function computeAgeAtAssessment(child: Child, assessment: Assessment): number {
    const birth = new Date(child.birthDate);
    const assessDate = assessment.completedAt ?? assessment.startedAt;
    const d = typeof assessDate === 'string' ? new Date(assessDate) : assessDate;
    const months = (d.getFullYear() - birth.getFullYear()) * 12 + (d.getMonth() - birth.getMonth());
    const dayAdjust = d.getDate() < birth.getDate() ? -1 : 0;
    return Math.max(0, months + dayAdjust);
  }

  // Build radar chart data from triageResult stored in DB
  // Note: the DB only stores { category, confidence, summary } without details.
  // We cannot reconstruct full radar data from the stored triageResult alone.

  function toggleExpand(assessmentId: string, child: Child) {
    if (expandedAssessmentId === assessmentId) {
      expandedAssessmentId = null;
      expandedChild = null;
    } else {
      expandedAssessmentId = assessmentId;
      expandedChild = child;
    }
  }

  $effect(() => {
    loadData();
  });

  async function loadData() {
    loading = true;
    try {
      const children = await getAllChildren();
      const result: ChildWithAssessments[] = [];
      for (const child of children) {
        const assessments = await getAssessmentsForChild(child.id);
        if (assessments.length > 0) {
          result.push({ child, assessments });
        }
      }
      childrenData = result;
    } catch {
      // Silently handle — empty state will show
    } finally {
      loading = false;
    }
  }
</script>

<div class="history-container">
  <h1 class="history-title">評估歷史</h1>

  {#if loading}
    <div class="loading-state">
      <div class="spinner"></div>
      <p>載入中...</p>
    </div>

  {:else if childrenData.length === 0}
    <div class="empty-state">
      <div class="empty-icon">📋</div>
      <h2>尚無評估紀錄</h2>
      <p>開始第一次評估，了解孩子的發展狀況。</p>
      <a href="/smart-pedi-cds/assess/" class="btn-start">開始新評估</a>
    </div>

  {:else}
    {#each childrenData as { child, assessments }}
      <section class="child-section">
        <h2 class="child-header">
          <span class="child-id">ID: {abbreviateId(child.id)}</span>
          <span class="child-age">目前 {ageInMonths(child.birthDate)} 個月</span>
        </h2>

        <div class="assessment-list">
          {#each assessments as assessment}
            {@const isCompleted = assessment.status === 'completed'}
            {@const isExpanded = expandedAssessmentId === assessment.id}
            {@const ageAtAssess = computeAgeAtAssessment(child, assessment)}

            <div class="assessment-card" class:expanded={isExpanded}>
              <button
                class="assessment-header"
                onclick={() => isCompleted ? toggleExpand(assessment.id, child) : null}
                disabled={!isCompleted}
                aria-expanded={isExpanded}
              >
                <span class="assess-date">{formatDate(assessment.completedAt ?? assessment.startedAt)}</span>
                <span class="assess-age">{ageAtAssess} 個月</span>
                {#if isCompleted && assessment.triageResult}
                  <span class="badge {categoryClasses[assessment.triageResult.category] ?? ''}">
                    {categoryLabels[assessment.triageResult.category] ?? assessment.triageResult.category}
                  </span>
                {:else}
                  <span class="badge badge-incomplete">
                    {assessment.status === 'completed' ? '已完成' : '未完成'}
                  </span>
                {/if}
                {#if isCompleted}
                  <span class="expand-icon" aria-hidden="true">{isExpanded ? '▾' : '▸'}</span>
                {/if}
              </button>

              {#if isExpanded && assessment.triageResult}
                <div class="assessment-detail">
                  <div class="triage-summary">
                    <div
                      class="triage-category"
                      class:triage-normal={assessment.triageResult.category === 'normal'}
                      class:triage-monitor={assessment.triageResult.category === 'monitor'}
                      class:triage-refer={assessment.triageResult.category === 'refer'}
                    >
                      <span class="triage-label">{categoryLabels[assessment.triageResult.category]}</span>
                      <span class="triage-confidence">信心度 {Math.round(assessment.triageResult.confidence * 100)}%</span>
                    </div>
                    <p class="triage-text">{assessment.triageResult.summary}</p>
                  </div>

                  <div class="detail-actions">
                    <AssessmentPdfReport {assessment} {child} />
                  </div>
                </div>
              {/if}
            </div>
          {/each}
        </div>
      </section>
    {/each}
  {/if}

  <div class="history-nav">
    <a href="/smart-pedi-cds/assess/" class="btn-back">返回評估</a>
  </div>
</div>

<style>
  .history-container {
    max-width: 700px;
    margin: 0 auto;
  }

  .history-title {
    font-size: var(--text-2xl);
    font-weight: var(--font-bold);
    margin-bottom: var(--space-6);
  }

  /* Loading */
  .loading-state {
    text-align: center;
    padding: var(--space-10);
  }

  .loading-state p {
    color: var(--color-text-muted);
    margin-top: var(--space-3);
  }

  .spinner {
    width: 40px;
    height: 40px;
    border: 3px solid var(--border-default);
    border-top-color: var(--color-accent);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    margin: 0 auto;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* Empty state */
  .empty-state {
    text-align: center;
    padding: var(--space-10);
  }

  .empty-icon {
    font-size: 48px;
    margin-bottom: var(--space-4);
  }

  .empty-state h2 {
    font-size: var(--text-xl);
    margin-bottom: var(--space-2);
  }

  .empty-state p {
    color: var(--color-text-muted);
    margin-bottom: var(--space-6);
  }

  .btn-start {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-3) var(--space-7);
    background: var(--color-accent);
    color: #fff;
    border: none;
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    text-decoration: none;
    min-height: 48px;
  }

  .btn-start:hover {
    background: var(--color-accent-hover);
  }

  /* Child section */
  .child-section {
    margin-bottom: var(--space-8);
  }

  .child-header {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    font-size: var(--text-base);
    font-weight: var(--font-medium);
    margin-bottom: var(--space-3);
    padding-bottom: var(--space-2);
    border-bottom: 1px solid var(--border-default);
  }

  .child-id {
    color: var(--color-text-base);
    font-family: var(--font-mono);
    font-size: var(--text-sm);
  }

  .child-age {
    color: var(--color-text-muted);
    font-size: var(--text-xs);
    font-weight: normal;
  }

  /* Assessment list */
  .assessment-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .assessment-card {
    background: var(--bg-surface);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-md);
    overflow: hidden;
    transition: border-color 0.2s;
  }

  .assessment-card.expanded {
    border-color: var(--color-accent);
  }

  .assessment-header {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    width: 100%;
    padding: var(--space-3) var(--space-4);
    background: none;
    border: none;
    cursor: pointer;
    text-align: left;
    font-size: var(--text-sm);
    color: var(--color-text-base);
    min-height: 48px;
  }

  .assessment-header:disabled {
    cursor: default;
    opacity: 0.7;
  }

  .assessment-header:not(:disabled):hover {
    background: var(--bg-surface-hover, rgba(0, 0, 0, 0.02));
  }

  .assess-date {
    font-weight: var(--font-medium);
    min-width: 100px;
  }

  .assess-age {
    color: var(--color-text-muted);
    font-size: var(--text-xs);
    min-width: 70px;
  }

  .expand-icon {
    margin-left: auto;
    color: var(--color-text-muted);
    font-size: var(--text-xs);
  }

  /* Badges */
  .badge {
    display: inline-block;
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-full);
    font-size: 12px;
    font-weight: var(--font-medium);
    line-height: 1;
  }

  .badge-normal {
    background: var(--color-risk-normal-bg);
    color: var(--color-risk-normal);
  }

  .badge-monitor {
    background: var(--color-risk-warning-bg);
    color: var(--color-risk-warning);
  }

  .badge-refer {
    background: var(--color-risk-critical-bg);
    color: var(--color-risk-critical);
  }

  .badge-incomplete {
    background: var(--bg-surface);
    color: var(--color-text-subtle);
    border: 1px solid var(--border-default);
  }

  /* Expanded detail */
  .assessment-detail {
    padding: var(--space-4);
    border-top: 1px solid var(--border-default);
  }

  .triage-summary {
    margin-bottom: var(--space-4);
  }

  .triage-category {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    margin-bottom: var(--space-2);
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-md);
    border: 1px solid;
  }

  .triage-normal {
    background: var(--color-risk-normal-bg);
    border-color: var(--color-risk-normal);
  }

  .triage-monitor {
    background: var(--color-risk-warning-bg);
    border-color: var(--color-risk-warning);
  }

  .triage-refer {
    background: var(--color-risk-critical-bg);
    border-color: var(--color-risk-critical);
  }

  .triage-label {
    font-weight: var(--font-bold);
    font-size: var(--text-base);
  }

  .triage-normal .triage-label { color: var(--color-risk-normal); }
  .triage-monitor .triage-label { color: var(--color-risk-warning); }
  .triage-refer .triage-label { color: var(--color-risk-critical); }

  .triage-confidence {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
  }

  .triage-text {
    font-size: var(--text-sm);
    color: var(--color-text-base);
    line-height: var(--lh-base);
  }

  .detail-actions {
    display: flex;
    gap: var(--space-3);
    flex-wrap: wrap;
  }

  /* Nav */
  .history-nav {
    padding-top: var(--space-6);
    border-top: 1px solid var(--border-default);
    margin-top: var(--space-6);
  }

  .btn-back {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-3) var(--space-6);
    background: var(--bg-surface);
    color: var(--color-text-base);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
    text-decoration: none;
    min-height: 44px;
    transition: border-color 0.2s;
  }

  .btn-back:hover {
    border-color: var(--color-accent);
  }
</style>
