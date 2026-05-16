<script lang="ts">
  import type { Alert, AlertStatus } from '../../lib/db/schema';
  import type { RiskLevel } from '../../lib/utils/risk-levels';

  interface Props {
    alerts: Alert[];
  }

  let { alerts }: Props = $props();

  const riskLabelMap: Record<RiskLevel, string> = {
    normal: '正常',
    advisory: '諮詢',
    warning: '警告',
    critical: '危急',
  };

  const statusLabelMap: Record<AlertStatus, string> = {
    open: '未處理',
    acknowledged: '已確認',
    false_positive: '誤報',
    resolved: '已解決',
  };

  const LEVEL_TO_COLOR: Record<string, string> = {
    normal:   'var(--accent)',
    advisory: 'var(--warn)',
    warning:  'var(--warn)',
    critical: 'var(--danger)',
  };

  const sortedAlerts = $derived(
    [...alerts].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    ),
  );

  function formatDate(date: Date): string {
    const d = new Date(date);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${y}/${m}/${day} ${h}:${min}`;
  }

  function hasEscalation(alert: Alert): boolean {
    return alert.parentAlertId != null;
  }
</script>

<section class="alert-timeline" aria-label="預警時間軸">
  {#if sortedAlerts.length === 0}
    <p class="no-data">此病患暫無預警紀錄</p>
  {:else}
    <ol class="timeline" role="list">
      {#each sortedAlerts as alert, i (alert.id)}
        {@const level = alert.riskLevel}
        {@const isLast = i === sortedAlerts.length - 1}
        <li class="timeline-entry">
          {#if hasEscalation(alert)}
            <div class="escalation-arrow" aria-label="升級自前一預警">
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M8 2 L12 8 L9 8 L9 14 L7 14 L7 8 L4 8 Z" fill="{LEVEL_TO_COLOR[level] ?? 'var(--accent)'}" />
              </svg>
            </div>
          {/if}

          <div class="dot-column">
            <div
              class="dot"
              style="background-color: {LEVEL_TO_COLOR[level] ?? 'var(--accent)'}"
              aria-hidden="true"
            ></div>
            {#if !isLast}
              <div class="connector" aria-hidden="true"></div>
            {/if}
          </div>

          <div class="entry-content">
            <div class="entry-header">
              <time class="entry-date" datetime={new Date(alert.createdAt).toISOString()}>
                {formatDate(alert.createdAt)}
              </time>
              <span class="risk-badge risk-{level}">{riskLabelMap[level]}</span>
              <span class="status-badge status-{alert.status}">{statusLabelMap[alert.status]}</span>
            </div>
            <p class="entry-rationale">{alert.rationale}</p>
          </div>
        </li>
      {/each}
    </ol>
  {/if}
</section>

<style>
  .alert-timeline {
    padding: var(--space-2) 0;
  }

  .no-data {
    text-align: center;
    color: color-mix(in srgb, var(--text), var(--bg) 30%);
    padding: var(--space-6) 0;
  }

  .timeline {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .timeline-entry {
    display: flex;
    gap: var(--space-3);
    position: relative;
  }

  .escalation-arrow {
    position: absolute;
    left: 2px;
    top: -14px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .dot-column {
    display: flex;
    flex-direction: column;
    align-items: center;
    flex-shrink: 0;
    width: 20px;
  }

  .dot {
    width: 14px;
    height: 14px;
    border-radius: var(--radius-full);
    flex-shrink: 0;
    margin-top: var(--space-1);
    border: 2px solid var(--surface);
    box-shadow: 0 0 0 1px var(--line);
  }

  .connector {
    width: 2px;
    flex: 1;
    min-height: var(--space-6);
    background-color: var(--line);
  }

  .entry-content {
    flex: 1;
    padding-bottom: var(--space-5);
  }

  .entry-header {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin-bottom: var(--space-1);
  }

  .entry-date {
    font-size: var(--text-xs);
    color: color-mix(in srgb, var(--text), var(--bg) 45%);
  }

  .risk-badge {
    font-size: var(--text-xs);
    font-weight: var(--font-medium);
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

  .status-badge {
    font-size: var(--text-xs);
    font-weight: var(--font-medium);
    padding: 2px var(--space-2);
    border-radius: var(--radius-full);
    border: 1px solid var(--line);
    color: color-mix(in srgb, var(--text), var(--bg) 30%);
    background-color: var(--surface);
  }

  .status-open {
    color: var(--danger);
    border-color: var(--danger);
    background-color: color-mix(in srgb, var(--danger) 14%, var(--bg));
  }

  .status-acknowledged {
    color: var(--warn);
    border-color: var(--warn);
    background-color: color-mix(in srgb, var(--warn) 12%, var(--bg));
  }

  .status-false_positive {
    color: color-mix(in srgb, var(--text), var(--bg) 45%);
    border-color: var(--line);
    background-color: var(--surface);
  }

  .status-resolved {
    color: var(--accent);
    border-color: var(--accent);
    background-color: color-mix(in srgb, var(--accent) 12%, var(--bg));
  }

  .entry-rationale {
    margin: 0;
    font-size: var(--text-xs);
    color: var(--text);
    line-height: 1.5;
  }
</style>
