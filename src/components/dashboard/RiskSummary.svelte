<script lang="ts">
  import { patientStore } from '../../lib/stores/patients.svelte';
  import type { RiskLevel } from '../../lib/utils/risk-levels';

  interface RiskCard {
    level: RiskLevel;
    label: string;
  }

  const cards: RiskCard[] = [
    { level: 'normal', label: '正常' },
    { level: 'advisory', label: '諮詢' },
    { level: 'warning', label: '警告' },
    { level: 'critical', label: '危急' },
  ];

  const LEVEL_TO_COLOR: Record<string, string> = {
    normal:   'var(--accent)',
    advisory: 'var(--warn)',
    warning:  'var(--warn)',
    critical: 'var(--danger)',
  };
</script>

<section class="risk-summary" aria-label="風險等級摘要">
  <div class="summary-grid">
    {#each cards as card (card.level)}
      <div
        class="summary-card risk-card-{card.level}"
        aria-label="{card.label}：{patientStore.riskSummary[card.level]} 人"
      >
        <span class="count">{patientStore.riskSummary[card.level]}</span>
        <span class="label">{card.label}</span>
        <div class="indicator-bar" style="background-color: {LEVEL_TO_COLOR[card.level] ?? 'var(--accent)'}"></div>
      </div>
    {/each}
  </div>
</section>

<style>
  .risk-summary {
    width: 100%;
  }

  .summary-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: var(--space-4);
  }

  @media (max-width: 639px) {
    .summary-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  .summary-card {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-5) var(--space-4);
    border: 1px solid var(--line);
    border-radius: var(--radius-md);
    background-color: var(--surface);
    overflow: hidden;
  }

  .indicator-bar {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 4px;
  }

  .count {
    font-size: 2rem;
    font-weight: 700;
    line-height: 1;
  }

  .label {
    font-size: 0.875rem;
    color: color-mix(in srgb, var(--text), var(--bg) 30%);
  }

  .risk-card-normal .count {
    color: var(--accent);
  }

  .risk-card-advisory .count {
    color: var(--warn);
  }

  .risk-card-warning .count {
    color: var(--warn);
  }

  .risk-card-critical .count {
    color: var(--danger);
  }
</style>
