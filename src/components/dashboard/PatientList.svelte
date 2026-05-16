<script lang="ts">
  import { patientStore } from '../../lib/stores/patients.svelte';
  import type { Patient } from '../../lib/db/schema';
  import type { RiskLevel } from '../../lib/utils/risk-levels';
  import { riskSeverity } from '../../lib/utils/risk-levels';

  let searchQuery = $state('');

  const sortedPatients = $derived.by(() => {
    const list = [...patientStore.patients];
    list.sort((a, b) => riskSeverity(b.currentRiskLevel) - riskSeverity(a.currentRiskLevel));
    return list;
  });

  const filteredPatients = $derived.by(() => {
    if (!searchQuery) return sortedPatients;
    const q = searchQuery.toLowerCase();
    return sortedPatients.filter(
      (p) =>
        p.id.toLowerCase().includes(q) ||
        (p.name?.toLowerCase().includes(q) ?? false),
    );
  });

  const riskLabelMap: Record<RiskLevel, string> = {
    normal: '正常',
    advisory: '諮詢',
    warning: '警告',
    critical: '危急',
  };

  const ageGroupLabel: Record<string, string> = {
    infant: '嬰兒',
    toddler: '幼兒',
    preschool: '學齡前',
  };

  function selectPatient(id: string) {
    patientStore.selectPatient(id);
    window.location.href = `/patients/${id}/`;
  }
</script>

<section class="patient-list" aria-label="病患列表">
  <div class="search-container">
    <label for="patient-search" class="visually-hidden">搜尋病患</label>
    <input
      id="patient-search"
      type="search"
      placeholder="搜尋姓名或 ID..."
      bind:value={searchQuery}
      aria-label="搜尋病患姓名或 ID"
      class="search-input"
    />
  </div>

  {#if patientStore.isLoading}
    <p class="status-message">載入中...</p>
  {:else if filteredPatients.length === 0}
    <p class="status-message">
      {searchQuery ? '找不到符合的病患' : '目前沒有病患資料'}
    </p>
  {:else}
    <ul class="card-list" role="list">
      {#each filteredPatients as patient (patient.id)}
        {@const level = patient.currentRiskLevel}
        <li>
          <button
            class="patient-card"
            class:pulse-critical={level === 'critical'}
            style="--bar-color: var(--color-risk-{level})"
            onclick={() => selectPatient(patient.id)}
            aria-label="選擇病患 {patient.name ?? patient.id}，風險等級：{riskLabelMap[level]}"
          >
            <div class="color-bar"></div>
            <div class="card-body">
              <div class="card-header">
                <span class="patient-name">{patient.name ?? patient.id}</span>
                <span class="age-badge">{ageGroupLabel[patient.ageGroup] ?? patient.ageGroup}</span>
              </div>
              <div class="card-footer">
                <span class="patient-id">{patient.id}</span>
                <span class="risk-badge risk-{level}">{riskLabelMap[level]}</span>
              </div>
            </div>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .patient-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .search-container {
    position: sticky;
    top: 0;
    z-index: 1;
    background-color: var(--bg);
    padding-bottom: var(--space-2);
  }

  .search-input {
    width: 100%;
    padding: var(--space-3) var(--space-4);
    border: 1px solid var(--line);
    border-radius: var(--radius-md);
    font-size: 1rem;
    color: var(--text);
    background-color: var(--surface);
    min-height: 44px;
  }

  .search-input::placeholder {
    color: color-mix(in srgb, var(--text), var(--bg) 45%);
  }

  .search-input:focus {
    outline: 2px solid var(--accent);
    outline-offset: -1px;
    border-color: var(--accent);
  }

  .status-message {
    text-align: center;
    color: color-mix(in srgb, var(--text), var(--bg) 30%);
    padding: var(--space-8) 0;
  }

  .card-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .patient-card {
    display: flex;
    width: 100%;
    border: 1px solid var(--line);
    border-radius: var(--radius-md);
    background-color: var(--surface);
    cursor: pointer;
    text-align: left;
    font: inherit;
    color: inherit;
    padding: 0;
    min-height: 44px;
    transition: box-shadow 0.2s ease, border-color 0.2s ease;
  }

  .patient-card:hover {
    border-color: color-mix(in srgb, var(--line), var(--text) 33%);
    box-shadow: var(--shadow-md);
  }

  .patient-card:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .patient-card.pulse-critical {
    animation: pulse-critical 2s ease-in-out infinite;
  }

  .color-bar {
    width: 6px;
    flex-shrink: 0;
    border-radius: var(--radius-md) 0 0 var(--radius-md);
    background-color: var(--bar-color);
  }

  .card-body {
    flex: 1;
    padding: var(--space-3) var(--space-4);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
  }

  .patient-name {
    font-weight: 600;
    color: var(--text);
  }

  .age-badge {
    font-size: 0.75rem;
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-full);
    background-color: color-mix(in srgb, var(--bg), var(--text) 5%);
    color: color-mix(in srgb, var(--text), var(--bg) 30%);
    white-space: nowrap;
  }

  .card-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
  }

  .patient-id {
    font-size: 0.8rem;
    color: color-mix(in srgb, var(--text), var(--bg) 45%);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .risk-badge {
    font-size: 0.75rem;
    font-weight: 600;
    padding: var(--space-1) var(--space-2);
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

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
</style>
