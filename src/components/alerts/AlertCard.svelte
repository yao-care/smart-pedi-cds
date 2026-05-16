<script lang="ts">
  import type { Alert, AlertStatus } from '../../lib/db/schema';
  import type { RiskLevel } from '../../lib/utils/risk-levels';

  interface Props {
    alert: Alert;
    onAcknowledge?: (id: string) => void;
    onFalsePositive?: (id: string) => void;
  }

  let { alert, onAcknowledge, onFalsePositive }: Props = $props();

  let showNotes = $state(false);
  let notes = $state('');
  let pendingAction = $state<'acknowledge' | 'falsePositive' | null>(null);

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

  function formatTimestamp(date: Date): string {
    const d = new Date(date);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${y}/${m}/${day} ${h}:${min}`;
  }

  function handleActionClick(action: 'acknowledge' | 'falsePositive') {
    pendingAction = action;
    showNotes = true;
  }

  function confirmAction() {
    if (pendingAction === 'acknowledge' && onAcknowledge) {
      onAcknowledge(alert.id);
    } else if (pendingAction === 'falsePositive' && onFalsePositive) {
      onFalsePositive(alert.id);
    }
    showNotes = false;
    pendingAction = null;
    notes = '';
  }

  function cancelAction() {
    showNotes = false;
    pendingAction = null;
    notes = '';
  }
</script>

<article
  class="alert-card"
  style="--bar-color: var(--color-risk-{alert.riskLevel})"
  aria-label="預警：{riskLabelMap[alert.riskLevel]}，病患 {alert.patientId}"
>
  <div class="color-bar"></div>

  <div class="card-content">
    <!-- Header -->
    <div class="card-header">
      <div class="header-left">
        <span class="risk-badge risk-{alert.riskLevel}">{riskLabelMap[alert.riskLevel]}</span>
        <span class="patient-id">{alert.patientId}</span>
      </div>
      <div class="header-right">
        <span class="status-badge status-{alert.status}">{statusLabelMap[alert.status]}</span>
        <time class="timestamp" datetime={new Date(alert.createdAt).toISOString()}>
          {formatTimestamp(alert.createdAt)}
        </time>
      </div>
    </div>

    <!-- Body -->
    <div class="card-body">
      <p class="rationale">{alert.rationale}</p>

      {#if alert.indicators.length > 0}
        <div class="indicators" aria-label="觸發指標">
          {#each alert.indicators as indicator}
            <span class="indicator-tag">{indicator}</span>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Education recommendations -->
    {#if alert.educationRecommended && alert.educationRecommended.length > 0}
      <div class="education-section">
        <h4 class="education-title">建議衛教</h4>
        <ul class="education-list">
          {#each alert.educationRecommended as rec}
            <li>{rec}</li>
          {/each}
        </ul>
      </div>
    {/if}

    <!-- Actions (only for open alerts) -->
    {#if alert.status === 'open'}
      <div class="card-actions">
        {#if !showNotes}
          <button
            class="action-btn btn-acknowledge"
            onclick={() => handleActionClick('acknowledge')}
            aria-label="確認此預警"
          >
            確認
          </button>
          <button
            class="action-btn btn-false-positive"
            onclick={() => handleActionClick('falsePositive')}
            aria-label="標記為誤報"
          >
            誤報
          </button>
        {:else}
          <div class="notes-section">
            <label for="notes-{alert.id}" class="notes-label">
              {pendingAction === 'acknowledge' ? '確認備註' : '誤報原因'}
            </label>
            <textarea
              id="notes-{alert.id}"
              class="notes-input"
              bind:value={notes}
              placeholder="輸入備註（選填）..."
              rows="2"
            ></textarea>
            <div class="notes-actions">
              <button
                class="action-btn btn-confirm"
                onclick={confirmAction}
                aria-label="送出"
              >
                送出
              </button>
              <button
                class="action-btn btn-cancel"
                onclick={cancelAction}
                aria-label="取消"
              >
                取消
              </button>
            </div>
          </div>
        {/if}
      </div>
    {/if}
  </div>
</article>

<style>
  .alert-card {
    display: flex;
    border: 1px solid var(--line);
    border-radius: var(--radius-md);
    background-color: var(--surface);
    overflow: hidden;
  }

  .color-bar {
    width: 6px;
    flex-shrink: 0;
    background-color: var(--bar-color);
  }

  .card-content {
    flex: 1;
    padding: var(--space-4);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .header-left,
  .header-right {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .risk-badge {
    font-size: 0.75rem;
    font-weight: 600;
    padding: 2px var(--space-2);
    border-radius: var(--radius-full);
    white-space: nowrap;
  }

  .risk-normal {
    color: var(--accent);
    background-color: var(--color-risk-normal-bg);
  }

  .risk-advisory {
    color: var(--warn);
    background-color: var(--color-risk-advisory-bg);
  }

  .risk-warning {
    color: var(--warn);
    background-color: var(--color-risk-warning-bg);
  }

  .risk-critical {
    color: var(--danger);
    background-color: var(--color-risk-critical-bg);
  }

  .patient-id {
    font-weight: 600;
    font-size: 0.875rem;
    color: var(--text);
  }

  .status-badge {
    font-size: 0.7rem;
    font-weight: 500;
    padding: 2px var(--space-2);
    border-radius: var(--radius-full);
    border: 1px solid var(--line);
    color: var(--color-text-muted);
    background-color: var(--bg-muted);
  }

  .status-open {
    color: var(--danger);
    border-color: var(--danger);
    background-color: var(--color-risk-critical-bg);
  }

  .status-acknowledged {
    color: var(--warn);
    border-color: var(--warn);
    background-color: var(--color-risk-advisory-bg);
  }

  .status-false_positive {
    color: var(--color-text-subtle);
  }

  .status-resolved {
    color: var(--accent);
    border-color: var(--accent);
    background-color: var(--color-risk-normal-bg);
  }

  .timestamp {
    font-size: 0.75rem;
    color: var(--color-text-subtle);
  }

  .card-body {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .rationale {
    margin: 0;
    font-size: 0.875rem;
    color: var(--text);
    line-height: 1.5;
  }

  .indicators {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
  }

  .indicator-tag {
    font-size: 0.7rem;
    padding: 2px var(--space-2);
    border-radius: var(--radius-full);
    background-color: var(--bg-muted);
    color: var(--color-text-muted);
    border: 1px solid var(--line);
  }

  .education-section {
    padding-top: var(--space-2);
    border-top: 1px solid var(--line);
  }

  .education-title {
    margin: 0 0 var(--space-1) 0;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--color-text-muted);
  }

  .education-list {
    margin: 0;
    padding-left: var(--space-5);
    font-size: 0.8rem;
    color: var(--text);
    line-height: 1.6;
  }

  .card-actions {
    padding-top: var(--space-2);
    border-top: 1px solid var(--line);
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .action-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 44px;
    min-width: 44px;
    padding: var(--space-2) var(--space-4);
    border: 1px solid var(--line);
    border-radius: var(--radius-md);
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    background-color: var(--surface);
    color: var(--text);
    transition: background-color 0.2s ease, border-color 0.2s ease;
  }

  .action-btn:hover {
    background-color: var(--bg-muted);
  }

  .action-btn:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .btn-acknowledge {
    color: var(--warn);
    border-color: var(--warn);
  }

  .btn-acknowledge:hover {
    background-color: var(--color-risk-advisory-bg);
  }

  .btn-false-positive {
    color: var(--color-text-muted);
  }

  .btn-confirm {
    color: white;
    background-color: var(--accent);
    border-color: var(--accent);
  }

  .btn-confirm:hover {
    background-color: color-mix(in srgb, var(--accent) 85%, black);
  }

  .btn-cancel {
    color: var(--color-text-muted);
  }

  .notes-section {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .notes-label {
    font-size: 0.8rem;
    font-weight: 500;
    color: var(--color-text-muted);
  }

  .notes-input {
    width: 100%;
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--line);
    border-radius: var(--radius-md);
    font-size: 0.875rem;
    font-family: inherit;
    color: var(--text);
    background-color: var(--bg);
    resize: vertical;
  }

  .notes-input:focus {
    outline: 2px solid var(--accent);
    outline-offset: -1px;
    border-color: var(--accent);
  }

  .notes-actions {
    display: flex;
    gap: var(--space-2);
  }
</style>
