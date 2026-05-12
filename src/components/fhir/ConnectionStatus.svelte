<script lang="ts">
  interface Props {
    isConnected: boolean;
    isSyncing: boolean;
    lastSyncTime: Date | null;
    errorMessage?: string;
  }

  let { isConnected, isSyncing, lastSyncTime, errorMessage }: Props = $props();

  function formatTime(date: Date | null): string {
    if (!date) return '從未同步';
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60_000);
    if (diffMin < 1) return '剛剛';
    if (diffMin < 60) return `${diffMin} 分鐘前`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr} 小時前`;
    return date.toLocaleDateString('zh-TW');
  }

  let statusLabel = $derived(
    isSyncing ? '同步中...' : isConnected ? '已連線' : '離線'
  );

  let dotClass = $derived(
    isSyncing ? 'dot dot--syncing' : isConnected ? 'dot dot--connected' : 'dot dot--disconnected'
  );
</script>

<div class="connection-status" aria-live="polite">
  <span class={dotClass} aria-hidden="true"></span>
  <span class="status-label">{statusLabel}</span>

  {#if lastSyncTime || isConnected}
    <span class="sync-time" title={lastSyncTime?.toLocaleString('zh-TW') ?? ''}>
      {formatTime(lastSyncTime)}
    </span>
  {/if}

  {#if !isConnected && !isSyncing && errorMessage}
    <span class="error-msg" title={errorMessage}>
      {errorMessage}
    </span>
  {/if}
</div>

<style>
  .connection-status {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    font-size: 0.8rem;
    color: var(--color-text-muted);
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: var(--radius-full);
    flex-shrink: 0;
  }

  .dot--connected {
    background: #3a8a3a;
  }

  .dot--syncing {
    background: #b87a1a;
    animation: blink 1s ease-in-out infinite;
  }

  .dot--disconnected {
    background: #c43a2b;
  }

  .status-label {
    font-weight: 600;
    color: var(--color-text-base);
  }

  .sync-time {
    color: var(--color-text-subtle);
    border-left: 1px solid var(--border-default);
    padding-left: var(--space-2);
    max-width: 120px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .error-msg {
    color: var(--color-risk-critical);
    border-left: 1px solid var(--border-default);
    padding-left: var(--space-2);
    max-width: 160px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: help;
  }

  @keyframes blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }
</style>
