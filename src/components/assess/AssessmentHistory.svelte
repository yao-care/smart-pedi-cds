<script lang="ts">
  import { getAllChildren, getAssessmentsForChild } from '../../lib/db/assessments';
  import { ageInMonths } from '../../lib/utils/age-groups';
  import { isAuthorized } from '../../lib/fhir/client';
  import type { Assessment, Child } from '../../lib/db/schema';

  interface ChildWithAssessments {
    child: Child;
    assessments: Assessment[];
  }

  let loading = $state(true);
  let childrenData = $state<ChildWithAssessments[]>([]);
  let compareIds = $state<Set<string>>(new Set());
  let showCompare = $state(false);

  const physicianMode = $derived(isAuthorized());

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
    return id.length > 8 ? id.slice(0, 8) + '…' : id;
  }

  function computeAgeAtAssessment(child: Child, assessment: Assessment): number {
    const birth = new Date(child.birthDate);
    const assessDate = assessment.completedAt ?? assessment.startedAt;
    const d = typeof assessDate === 'string' ? new Date(assessDate) : assessDate;
    const months = (d.getFullYear() - birth.getFullYear()) * 12 + (d.getMonth() - birth.getMonth());
    const dayAdjust = d.getDate() < birth.getDate() ? -1 : 0;
    return Math.max(0, months + dayAdjust);
  }

  function detailLink(id: string): string {
    return physicianMode ? `/workspace/result/?id=${id}` : `/result/?id=${id}`;
  }

  function toggleCompare(id: string) {
    const next = new Set(compareIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    compareIds = next;
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
          // newest first
          assessments.sort((a, b) => {
            const ta = new Date(a.completedAt ?? a.startedAt).getTime();
            const tb = new Date(b.completedAt ?? b.startedAt).getTime();
            return tb - ta;
          });
          result.push({ child, assessments });
        }
      }
      childrenData = result;
    } catch {
      // Empty state will show
    } finally {
      loading = false;
    }
  }

  const allAssessments = $derived(
    childrenData.flatMap((c) => c.assessments.map((a) => ({ child: c.child, assessment: a }))),
  );

  const stats = $derived.by(() => {
    const completed = allAssessments.filter(({ assessment }) => assessment.status === 'completed');
    const latest = completed[0]?.assessment ?? null;
    return {
      total: allAssessments.length,
      completedTotal: completed.length,
      latestDate: latest ? formatDate(latest.completedAt ?? latest.startedAt) : '—',
      latestCategory: latest?.triageResult?.category ?? null,
    };
  });

  const compareRows = $derived(
    allAssessments.filter(({ assessment }) => compareIds.has(assessment.id)),
  );
</script>

<div class="history-container">
  <header class="history-header">
    <h1 class="history-title">評估歷史</h1>
    <span class="source-badge" class:source-fhir={physicianMode}>
      {physicianMode ? '醫院 FHIR Server' : '本地紀錄'}
    </span>
  </header>

  {#if loading}
    <div class="loading-state">
      <div class="spinner"></div>
      <p>載入中…</p>
    </div>
  {:else if childrenData.length === 0}
    <div class="empty-state">
      <div class="empty-icon">🌱</div>
      <h2>還沒有評估紀錄</h2>
      <p>完成第一次評估後，紀錄會在這裡保留。</p>
      <a href="/" class="btn-start">開始評估</a>
    </div>
  {:else}
    <section class="stats-row" aria-label="評估統計">
      <div class="stat-card">
        <span class="stat-label">總評估次數</span>
        <strong class="stat-value">{stats.total}</strong>
      </div>
      <div class="stat-card">
        <span class="stat-label">最近一次</span>
        <strong class="stat-value">{stats.latestDate}</strong>
      </div>
      <div class="stat-card">
        <span class="stat-label">最近分流</span>
        <strong class="stat-value">
          {stats.latestCategory ? categoryLabels[stats.latestCategory] : '—'}
        </strong>
      </div>
    </section>

    {#each childrenData as { child, assessments }}
      <section class="child-section">
        <h2 class="child-header">
          <span class="child-id">ID: {abbreviateId(child.id)}</span>
          <span class="child-age">目前 {ageInMonths(child.birthDate)} 個月</span>
        </h2>

        <ol class="timeline">
          {#each assessments as assessment}
            {@const isCompleted = assessment.status === 'completed'}
            {@const ageAtAssess = computeAgeAtAssessment(child, assessment)}
            {@const selected = compareIds.has(assessment.id)}
            <li class="timeline-row" class:selected>
              <div class="timeline-main">
                <span class="row-date">{formatDate(assessment.completedAt ?? assessment.startedAt)}</span>
                <span class="row-age">{ageAtAssess} 個月</span>
                {#if isCompleted && assessment.triageResult}
                  <span class="badge {categoryClasses[assessment.triageResult.category] ?? ''}">
                    {categoryLabels[assessment.triageResult.category] ?? assessment.triageResult.category}
                  </span>
                {:else}
                  <span class="badge badge-incomplete">{isCompleted ? '已完成' : '未完成'}</span>
                {/if}
              </div>
              <div class="timeline-actions">
                {#if isCompleted}
                  <a href={detailLink(assessment.id)} class="action-link">👁 看詳細</a>
                  <label class="compare-toggle">
                    <input
                      type="checkbox"
                      checked={selected}
                      onchange={() => toggleCompare(assessment.id)}
                    />
                    比較
                  </label>
                {/if}
              </div>
            </li>
          {/each}
        </ol>
      </section>
    {/each}
  {/if}

  {#if compareIds.size >= 2}
    <div class="compare-bar" role="region" aria-label="比較選取">
      <span>已選 {compareIds.size} 筆</span>
      <button type="button" class="btn-compare" onclick={() => (showCompare = true)}>
        比較 →
      </button>
      <button type="button" class="btn-clear" onclick={() => (compareIds = new Set())}>清空</button>
    </div>
  {/if}

  {#if showCompare && compareRows.length >= 2}
    <section class="compare-view" aria-label="比較結果">
      <div class="compare-header">
        <h2>比較結果</h2>
        <button type="button" class="btn-close" onclick={() => (showCompare = false)}>✕ 關閉</button>
      </div>
      <div class="compare-grid">
        {#each compareRows as row}
          <article class="compare-card">
            <h3>{formatDate(row.assessment.completedAt ?? row.assessment.startedAt)}</h3>
            <p class="compare-age">{computeAgeAtAssessment(row.child, row.assessment)} 個月</p>
            {#if row.assessment.triageResult}
              <span class="badge {categoryClasses[row.assessment.triageResult.category] ?? ''}">
                {categoryLabels[row.assessment.triageResult.category]}
              </span>
              <p class="compare-summary">{row.assessment.triageResult.summary}</p>
              <a href={detailLink(row.assessment.id)} class="action-link">看完整詳細 →</a>
            {/if}
          </article>
        {/each}
      </div>
    </section>
  {/if}

  <div class="history-nav">
    <a href="/" class="btn-back">返回首頁</a>
  </div>
</div>

<style>
  .history-container {
    max-width: 800px;
    margin: 0 auto;
  }

  .history-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-6);
  }

  .history-title {
    font-size: var(--text-2xl);
    font-weight: var(--font-bold);
    margin: 0;
  }

  .source-badge {
    padding: 4px 12px;
    border-radius: var(--radius-full);
    background: var(--bg-muted);
    color: var(--color-text-muted);
    font-size: var(--text-xs);
  }

  .source-badge.source-fhir {
    background: var(--color-risk-advisory-bg);
    color: var(--color-risk-advisory);
  }

  .loading-state {
    text-align: center;
    padding: var(--space-10);
  }

  .spinner {
    width: 40px;
    height: 40px;
    border: 3px solid var(--border-default);
    border-top-color: var(--color-accent);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    margin: 0 auto var(--space-3);
  }

  @keyframes spin { to { transform: rotate(360deg); } }

  .empty-state {
    text-align: center;
    padding: var(--space-10) var(--space-4);
  }

  .empty-icon {
    font-size: 56px;
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
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    text-decoration: none;
    min-height: 48px;
  }

  .btn-start:hover { background: var(--color-accent-hover); }

  .stats-row {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: var(--space-3);
    margin-bottom: var(--space-6);
  }

  .stat-card {
    display: flex;
    flex-direction: column;
    padding: var(--space-3) var(--space-4);
    background: var(--bg-surface);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-md);
  }

  .stat-label {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    margin-bottom: var(--space-1);
  }

  .stat-value {
    font-size: var(--text-lg);
    font-weight: var(--font-bold);
    color: var(--color-text-base);
  }

  .child-section { margin-bottom: var(--space-8); }

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

  .timeline {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .timeline-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    background: var(--bg-surface);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
  }

  .timeline-row.selected {
    border-color: var(--color-accent);
    background: var(--color-risk-advisory-bg);
  }

  .timeline-main {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    flex-wrap: wrap;
  }

  .row-date { font-weight: var(--font-medium); min-width: 100px; }
  .row-age { color: var(--color-text-muted); font-size: var(--text-xs); }

  .timeline-actions {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .action-link {
    color: var(--color-accent);
    text-decoration: none;
    font-size: var(--text-xs);
    min-height: 32px;
    display: inline-flex;
    align-items: center;
  }

  .compare-toggle {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    cursor: pointer;
  }

  .badge {
    display: inline-block;
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-full);
    font-size: 12px;
    font-weight: var(--font-medium);
    line-height: 1;
  }

  .badge-normal { background: var(--color-risk-normal-bg); color: var(--color-risk-normal); }
  .badge-monitor { background: var(--color-risk-warning-bg); color: var(--color-risk-warning); }
  .badge-refer { background: var(--color-risk-critical-bg); color: var(--color-risk-critical); }
  .badge-incomplete { background: var(--bg-surface); color: var(--color-text-subtle); border: 1px solid var(--border-default); }

  .compare-bar {
    position: sticky;
    bottom: 0;
    background: var(--bg-surface);
    border-top: 1px solid var(--border-default);
    padding: var(--space-3) var(--space-4);
    display: flex;
    align-items: center;
    gap: var(--space-3);
    z-index: 10;
  }

  .btn-compare,
  .btn-clear {
    padding: 6px 14px;
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
    border: 1px solid var(--border-default);
    cursor: pointer;
    min-height: 36px;
  }

  .btn-compare {
    background: var(--color-accent);
    color: #fff;
    border-color: var(--color-accent);
    margin-left: auto;
  }

  .btn-clear {
    background: none;
    color: var(--color-text-muted);
  }

  .compare-view {
    margin-top: var(--space-6);
    padding: var(--space-4);
    background: var(--bg-surface);
    border: 1px solid var(--color-accent);
    border-radius: var(--radius-lg);
  }

  .compare-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-4);
  }

  .compare-header h2 {
    margin: 0;
    font-size: var(--text-lg);
  }

  .btn-close {
    background: none;
    border: none;
    color: var(--color-text-muted);
    cursor: pointer;
    font-size: var(--text-sm);
  }

  .compare-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: var(--space-3);
  }

  .compare-card {
    padding: var(--space-3);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-md);
    background: var(--bg-base);
  }

  .compare-card h3 {
    margin: 0 0 var(--space-1);
    font-size: var(--text-sm);
  }

  .compare-age {
    color: var(--color-text-muted);
    font-size: var(--text-xs);
    margin: 0 0 var(--space-2);
  }

  .compare-summary {
    font-size: var(--text-xs);
    color: var(--color-text-base);
    line-height: 1.5;
    margin: var(--space-2) 0;
  }

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
  }

  .btn-back:hover { border-color: var(--color-accent); }
</style>
