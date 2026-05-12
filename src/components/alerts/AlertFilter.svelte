<script lang="ts">
  interface Props {
    onFilterChange: (filters: { level: string; status: string }) => void;
  }

  let { onFilterChange }: Props = $props();

  let selectedLevel = $state('all');
  let selectedStatus = $state('all');

  function handleChange() {
    onFilterChange({ level: selectedLevel, status: selectedStatus });
  }
</script>

<div class="alert-filter" role="group" aria-label="預警篩選條件">
  <div class="filter-field">
    <label for="filter-level" class="filter-label">風險等級</label>
    <select
      id="filter-level"
      class="filter-select"
      bind:value={selectedLevel}
      onchange={handleChange}
      aria-label="依風險等級篩選"
    >
      <option value="all">全部</option>
      <option value="normal">正常</option>
      <option value="advisory">諮詢</option>
      <option value="warning">警告</option>
      <option value="critical">危急</option>
    </select>
  </div>

  <div class="filter-field">
    <label for="filter-status" class="filter-label">狀態</label>
    <select
      id="filter-status"
      class="filter-select"
      bind:value={selectedStatus}
      onchange={handleChange}
      aria-label="依狀態篩選"
    >
      <option value="all">全部</option>
      <option value="open">未處理</option>
      <option value="acknowledged">已確認</option>
      <option value="false_positive">誤報</option>
      <option value="resolved">已解決</option>
    </select>
  </div>
</div>

<style>
  .alert-filter {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-4);
    align-items: flex-end;
  }

  .filter-field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .filter-label {
    font-size: 0.8rem;
    font-weight: 500;
    color: var(--color-text-muted);
  }

  .filter-select {
    min-height: 44px;
    min-width: 140px;
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-md);
    font-size: 0.875rem;
    color: var(--color-text-base);
    background-color: var(--bg-surface);
    cursor: pointer;
    appearance: auto;
  }

  .filter-select:focus {
    outline: 2px solid var(--color-accent);
    outline-offset: -1px;
    border-color: var(--color-accent);
  }

  .filter-select:hover {
    border-color: var(--border-strong);
  }
</style>
