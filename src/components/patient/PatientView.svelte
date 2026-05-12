<script lang="ts">
  import { patientStore } from '../../lib/stores/patients.svelte';
  import { getObservationHistory, getLatestObservations } from '../../lib/db/observations';
  import { getAlertHistory } from '../../lib/db/alerts';
  import { INDICATOR_NAMES, INDICATOR_LABELS, INDICATOR_UNITS } from '../../lib/utils/loinc-map';
  import type { Alert, Observation } from '../../lib/db/schema';
  import TrendChart from './TrendChart.svelte';
  import AlertTimeline from './AlertTimeline.svelte';

  let patientId = $state('');
  let alerts = $state<Alert[]>([]);
  let chartData = $state<Record<string, Array<{ date: Date; value: number }>>>({});
  let baselines = $state<Record<string, { mean: number; std: number }>>({});
  let isLoading = $state(true);
  let timeRange = $state<'day' | 'week' | 'month'>('week');

  const timeRangeMs = $derived.by(() => {
    switch (timeRange) {
      case 'day': return 24 * 60 * 60 * 1000;
      case 'week': return 7 * 24 * 60 * 60 * 1000;
      case 'month': return 30 * 24 * 60 * 60 * 1000;
    }
  });

  $effect(() => {
    // Read patient ID from URL
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    if (id) {
      patientId = id;
      patientStore.selectPatient(id);
      loadData(id);
    }
  });

  async function loadData(id: string) {
    isLoading = true;
    try {
      const since = new Date(Date.now() - timeRangeMs);

      // Load observation history for each indicator
      const newChartData: typeof chartData = {};
      for (const indicator of INDICATOR_NAMES) {
        const obs = await getObservationHistory(id, indicator, since);
        newChartData[indicator] = obs.map(o => ({
          date: o.effectiveDateTime,
          value: o.value,
        }));
      }
      chartData = newChartData;

      // Load alerts
      alerts = await getAlertHistory(id, since);

      // Load baselines from store/DB (simplified — use population baseline)
      // In a full implementation, this would come from the baseline worker
    } catch (e) {
      console.error('Failed to load patient data');
    } finally {
      isLoading = false;
    }
  }

  // Reload when time range changes
  $effect(() => {
    if (patientId) {
      loadData(patientId);
    }
  });
</script>

{#if !patientId}
  <p class="empty-state">請提供病患 ID 參數（例如 ?id=xxx）。</p>
{:else if isLoading}
  <p class="loading">載入中…</p>
{:else}
  <div class="patient-header">
    <h2>病患 {patientId}</h2>
    <div class="time-range-controls">
      <button class:active={timeRange === 'day'} onclick={() => timeRange = 'day'}>日</button>
      <button class:active={timeRange === 'week'} onclick={() => timeRange = 'week'}>週</button>
      <button class:active={timeRange === 'month'} onclick={() => timeRange = 'month'}>月</button>
    </div>
  </div>

  <section class="trend-charts" aria-label="指標趨勢圖">
    <h3>指標趨勢圖</h3>
    <div class="chart-grid">
      {#each INDICATOR_NAMES as indicator}
        {@const data = chartData[indicator] ?? []}
        {@const baseline = baselines[indicator]}
        {#if data.length > 0}
          <div class="chart-item">
            <TrendChart
              {data}
              baselineMean={baseline?.mean ?? null}
              baselineStd={baseline?.std ?? null}
              indicatorName={INDICATOR_LABELS[indicator]}
              unit={INDICATOR_UNITS[indicator]}
            />
          </div>
        {/if}
      {/each}
    </div>
  </section>

  <section class="alert-timeline-section" aria-label="預警時間軸">
    <h3>預警時間軸</h3>
    <AlertTimeline {alerts} />
  </section>
{/if}

<style>
  .patient-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-6);
    flex-wrap: wrap;
    gap: var(--space-4);
  }

  .time-range-controls {
    display: flex;
    gap: var(--space-2);
  }

  .time-range-controls button {
    padding: var(--space-2) var(--space-4);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-md);
    background: var(--bg-surface);
    color: var(--color-text-muted);
    cursor: pointer;
    font-size: var(--text-xs);
  }

  .time-range-controls button.active {
    background: var(--color-accent);
    color: #fff;
    border-color: var(--color-accent);
  }

  .chart-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
    gap: var(--space-6);
  }

  .chart-item {
    background: var(--bg-surface);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-lg);
    padding: var(--space-4);
  }

  section {
    margin-bottom: var(--space-8);
  }

  section h3 {
    font-size: var(--text-lg);
    font-weight: var(--font-bold);
    margin-bottom: var(--space-4);
  }

  .empty-state, .loading {
    text-align: center;
    padding: var(--space-8);
    color: var(--color-text-muted);
  }
</style>
