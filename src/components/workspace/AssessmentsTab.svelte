<script lang="ts">
  /**
   * Workspace "評估" tab: every CDSA DiagnosticReport the physician can
   * read, grouped by triage category. Each row links into the per-id
   * detail view via /workspace/result/?id=.
   */
  import { listAssessmentsFromFhir, type AssessmentSummary } from '../../lib/fhir/assessment-fetch';
  import { getClient, isAuthorized } from '../../lib/fhir/client';

  type Category = 'refer' | 'monitor' | 'normal';

  const CATEGORY_LABELS: Record<Category, string> = {
    refer: '建議轉介',
    monitor: '追蹤觀察',
    normal: '正常',
  };

  const CATEGORY_ORDER: Category[] = ['refer', 'monitor', 'normal'];

  let loading = $state(true);
  let error = $state<string | null>(null);
  let rows = $state<AssessmentSummary[]>([]);

  $effect(() => {
    (async () => {
      if (!isAuthorized()) {
        error = '需要 FHIR Server 登入';
        loading = false;
        return;
      }
      try {
        rows = await listAssessmentsFromFhir(undefined, getClient());
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : '載入失敗';
        error = message;
      } finally {
        loading = false;
      }
    })();
  });

  const grouped = $derived.by(() => {
    const map: Record<Category, AssessmentSummary[]> = { refer: [], monitor: [], normal: [] };
    for (const r of rows) {
      map[r.category].push(r);
    }
    return map;
  });

  function formatDate(d: Date): string {
    return d.toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' });
  }

  function shortRef(ref: string): string {
    const id = ref.replace(/^Patient\//, '');
    return id.length > 8 ? `${id.slice(0, 8)}…` : id;
  }
</script>

<section class="assessments-tab" aria-label="所有評估清單">
  <header class="tab-header">
    <h2>所有 CDSA 評估</h2>
    {#if rows.length > 0}
      <span class="count-total">共 {rows.length} 筆</span>
    {/if}
  </header>

  {#if loading}
    <p class="status">載入中…</p>
  {:else if error}
    <p class="status error">{error}</p>
  {:else if rows.length === 0}
    <div class="empty">
      <p>FHIR Server 上目前沒有 CDSA 評估報告。</p>
    </div>
  {:else}
    {#each CATEGORY_ORDER as cat}
      {@const list = grouped[cat]}
      {#if list.length > 0}
        <section class="group" aria-labelledby="cat-{cat}">
          <header class="group-header">
            <span class="badge badge-{cat}">{CATEGORY_LABELS[cat]}</span>
            <span class="group-count">{list.length} 筆</span>
          </header>
          <ul class="list">
            {#each list as row}
              <li class="row">
                <span class="row-date">{formatDate(row.date)}</span>
                <span class="row-patient">病人 {shortRef(row.patientRef)}</span>
                <span class="row-summary" title={row.summary}>{row.summary || '—'}</span>
                <a class="row-link" href={`/workspace/result/?id=${encodeURIComponent(row.id)}`}>
                  看詳細 →
                </a>
              </li>
            {/each}
          </ul>
        </section>
      {/if}
    {/each}
  {/if}
</section>

<style>
  .assessments-tab {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
  }

  .tab-header {
    display: flex;
    align-items: baseline;
    gap: var(--space-3);
  }

  .tab-header h2 {
    margin: 0;
    font-size: var(--text-lg);
  }

  .count-total {
    color: var(--color-text-muted);
    font-size: var(--text-xs);
  }

  .status {
    text-align: center;
    padding: var(--space-6);
    color: var(--color-text-muted);
  }

  .status.error {
    color: var(--color-risk-critical);
  }

  .empty {
    text-align: center;
    padding: var(--space-8);
    color: var(--color-text-muted);
    background: var(--bg-surface);
    border: 1px dashed var(--border-default);
    border-radius: var(--radius-md);
  }

  .group {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .group-header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    border-bottom: 1px solid var(--border-default);
  }

  .group-count {
    color: var(--color-text-muted);
    font-size: var(--text-xs);
  }

  .badge {
    padding: 2px 10px;
    border-radius: var(--radius-full);
    font-size: var(--text-xs);
    font-weight: var(--font-medium);
  }

  .badge-refer {
    background: var(--color-risk-critical-bg);
    color: var(--color-risk-critical);
  }

  .badge-monitor {
    background: var(--color-risk-warning-bg);
    color: var(--color-risk-warning);
  }

  .badge-normal {
    background: var(--color-risk-normal-bg);
    color: var(--color-risk-normal);
  }

  .list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .row {
    display: grid;
    grid-template-columns: 110px 120px 1fr auto;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-2) var(--space-3);
    background: var(--bg-surface);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-sm);
    font-size: var(--text-sm);
  }

  .row:hover {
    border-color: var(--color-accent);
  }

  .row-date {
    font-weight: var(--font-medium);
  }

  .row-patient {
    color: var(--color-text-muted);
    font-family: var(--font-mono);
    font-size: var(--text-xs);
  }

  .row-summary {
    color: var(--color-text-base);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .row-link {
    color: var(--color-accent);
    text-decoration: none;
    font-size: var(--text-xs);
  }

  @media (max-width: 720px) {
    .row {
      grid-template-columns: 1fr auto;
    }

    .row-patient,
    .row-summary {
      grid-column: 1 / -1;
    }
  }
</style>
