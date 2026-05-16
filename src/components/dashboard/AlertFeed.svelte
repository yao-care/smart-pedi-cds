<script lang="ts">
  import { alertStore } from '../../lib/stores/alerts.svelte';
  import type { Alert } from '../../lib/db/schema';
  import type { RiskLevel } from '../../lib/utils/risk-levels';

  const REFRESH_INTERVAL_MS = 30_000;
  const MAX_DISPLAY = 10;

  const riskLabelMap: Record<RiskLevel, string> = {
    normal: '正常',
    advisory: '諮詢',
    warning: '警告',
    critical: '危急',
  };

  const LEVEL_TO_COLOR: Record<string, string> = {
    normal:   'var(--accent)',
    advisory: 'var(--warn)',
    warning:  'var(--warn)',
    critical: 'var(--danger)',
  };

  const openAlerts = $derived.by(() => {
    return alertStore.alerts
      .filter((a) => a.status === 'open')
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, MAX_DISPLAY);
  });

  function formatTimestamp(date: Date): string {
    const d = new Date(date);
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${month}/${day} ${hours}:${minutes}`;
  }

  function truncate(text: string, maxLen: number): string {
    if (text.length <= maxLen) return text;
    return text.slice(0, maxLen) + '...';
  }

  $effect(() => {
    alertStore.loadAlerts();
    const interval = setInterval(() => {
      alertStore.loadAlerts();
    }, REFRESH_INTERVAL_MS);

    return () => clearInterval(interval);
  });
</script>

<section class="alert-feed" aria-label="即時預警">
  <div class="feed-header">
    <h2 class="feed-title">即時預警</h2>
    <span class="open-count" aria-label="未處理預警數量">{alertStore.openCount}</span>
  </div>

  {#if alertStore.isLoading && openAlerts.length === 0}
    <p class="status-message">載入中...</p>
  {:else if openAlerts.length === 0}
    <p class="status-message">目前沒有未處理的預警</p>
  {:else}
    <ul class="feed-list" role="list">
      {#each openAlerts as alert (alert.id)}
        <li class="feed-item" style="border-left-color: {LEVEL_TO_COLOR[alert.riskLevel] ?? 'var(--accent)'}">
          <div class="item-header">
            <time class="timestamp" datetime={new Date(alert.createdAt).toISOString()}>
              {formatTimestamp(alert.createdAt)}
            </time>
            <span class="risk-badge risk-{alert.riskLevel}">
              {riskLabelMap[alert.riskLevel]}
            </span>
          </div>
          <div class="item-body">
            <span class="patient-id">{alert.patientId}</span>
            <p class="rationale">{truncate(alert.rationale, 80)}</p>
          </div>
        </li>
      {/each}
    </ul>
  {/if}

  <div class="feed-footer">
    <a href="/alerts/" class="view-all" aria-label="查看所有預警">
      查看全部
    </a>
  </div>
</section>

<style>
  .alert-feed {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .feed-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
  }

  .feed-title {
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--text);
    margin: 0;
  }

  .open-count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 28px;
    height: 28px;
    padding: 0 var(--space-2);
    border-radius: var(--radius-full);
    background-color: var(--danger);
    color: white;
    font-size: 0.8rem;
    font-weight: 700;
  }

  .status-message {
    text-align: center;
    color: color-mix(in srgb, var(--text), var(--bg) 30%);
    padding: var(--space-6) 0;
  }

  .feed-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .feed-item {
    padding: var(--space-3) var(--space-4);
    border-left: 4px solid var(--line);
    border-radius: var(--radius-sm);
    background-color: var(--surface);
  }

  .item-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    margin-bottom: var(--space-1);
  }

  .timestamp {
    font-size: 0.75rem;
    color: color-mix(in srgb, var(--text), var(--bg) 45%);
  }

  .risk-badge {
    font-size: 0.7rem;
    font-weight: 600;
    padding: 2px var(--space-2);
    border-radius: var(--radius-full);
    white-space: nowrap;
  }

  .risk-normal {
    color: var(--accent);
    background-color: color-mix(in srgb, var(--accent) 12%, var(--bg));
  }

  .risk-advisory {
    color: var(--warn);
    background-color: color-mix(in srgb, var(--warn) 12%, var(--bg));
  }

  .risk-warning {
    color: var(--warn);
    background-color: color-mix(in srgb, var(--warn) 12%, var(--bg));
  }

  .risk-critical {
    color: var(--danger);
    background-color: color-mix(in srgb, var(--danger) 14%, var(--bg));
  }

  .item-body {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .patient-id {
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--text);
  }

  .rationale {
    margin: 0;
    font-size: 0.8rem;
    color: color-mix(in srgb, var(--text), var(--bg) 30%);
    line-height: 1.4;
  }

  .feed-footer {
    text-align: center;
    padding-top: var(--space-2);
  }

  .view-all {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 44px;
    padding: var(--space-2) var(--space-4);
    color: var(--accent);
    font-size: 0.875rem;
    font-weight: 600;
    text-decoration: none;
    border-radius: var(--radius-md);
  }

  .view-all:hover {
    text-decoration: underline;
    color: color-mix(in srgb, var(--accent) 85%, black);
  }

  .view-all:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
</style>
