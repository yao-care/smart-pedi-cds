<script lang="ts">
  import { alertStore } from '../../lib/stores/alerts.svelte';
  import AlertFilter from './AlertFilter.svelte';
  import AlertCard from './AlertCard.svelte';
  import type { AlertStatus } from '../../lib/db/schema';
  import type { RiskLevel } from '../../lib/utils/risk-levels';

  let isLoading = $state(true);

  $effect(() => {
    alertStore.loadAllAlerts().then(() => {
      isLoading = false;
    });
  });

  function handleFilterChange(filters: { level: string; status: string }) {
    alertStore.setFilterLevel(filters.level as RiskLevel | 'all');
    alertStore.setFilterStatus(filters.status as AlertStatus | 'all');
  }

  async function handleAcknowledge(id: string) {
    await alertStore.acknowledgeAlert(id);
  }

  async function handleFalsePositive(id: string) {
    await alertStore.markFalsePositive(id);
  }
</script>

<div class="alert-manager">
  <section class="filter-section" aria-label="預警篩選">
    <AlertFilter onFilterChange={handleFilterChange} />
  </section>

  <section class="list-section" aria-label="預警列表">
    {#if isLoading}
      <p class="loading">載入中…</p>
    {:else if alertStore.filteredAlerts.length === 0}
      <p class="empty-state">目前沒有符合條件的預警。</p>
    {:else}
      <div class="alert-list">
        {#each alertStore.filteredAlerts as alert (alert.id)}
          <AlertCard
            {alert}
            onAcknowledge={handleAcknowledge}
            onFalsePositive={handleFalsePositive}
          />
        {/each}
      </div>
    {/if}
  </section>

  <div class="summary-bar">
    <span>共 {alertStore.filteredAlerts.length} 筆預警</span>
    <span>開啟中：{alertStore.openCount}</span>
    <span class="critical-count">緊急：{alertStore.criticalCount}</span>
  </div>
</div>

<style>
  .alert-manager {
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
  }

  .alert-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .summary-bar {
    display: flex;
    gap: var(--space-6);
    padding: var(--space-3) var(--space-4);
    background: var(--surface);
    border-radius: var(--radius-md);
    font-size: var(--text-xs);
    color: color-mix(in srgb, var(--text), var(--bg) 30%);
  }

  .critical-count {
    color: var(--danger);
    font-weight: var(--font-bold);
  }

  .loading, .empty-state {
    text-align: center;
    padding: var(--space-8);
    color: color-mix(in srgb, var(--text), var(--bg) 30%);
  }
</style>
