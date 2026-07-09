<script lang="ts">
interface Props {
  data: Array<{
    domain: string;
    score: number;
    hasAnomaly: boolean;
    isHybrid?: boolean;
  }>;
  size?: number;
  title?: string;
  showLegend?: boolean;
}
const { data, size = 320, title = '各面向表現位階', showLegend = true }: Props = $props();

const domainLabels: Record<string, string> = {
  behavior: '行為',
  gross_motor: '粗動作',
  fine_motor: '細動作',
  language: '語言',
  language_comprehension: '語言理解',
  language_expression: '語言表達',
  cognition: '認知',
  social_emotional: '社會情緒',
};

const center = $derived(size / 2);
const radius = $derived(size / 2 - 60);
const angleStep = $derived(data.length > 0 ? (2 * Math.PI) / data.length : 0);

function polarToCartesian(angle: number, r: number): { x: number; y: number } {
  return {
    x: center + r * Math.cos(angle - Math.PI / 2),
    y: center + r * Math.sin(angle - Math.PI / 2),
  };
}
</script>

<div class="radar-wrap">
  <header class="radar-header">
    <h3>{title}</h3>
    {#if showLegend}
      <p class="legend">50 = 與同齡孩子相當　·　高於 50 = 這次表現較突出　·　低於 50 = 這次還在發展中</p>
    {/if}
  </header>
  <svg viewBox="-48 -48 {size + 96} {size + 96}" width={size} height={size} class="radar-chart" role="img" aria-label="發展面向雷達圖">
    {#if data.length >= 3}
      <polygon
        points={data.map((_, i) => {
          const p = polarToCartesian(angleStep * i, radius);
          return `${p.x},${p.y}`;
        }).join(' ')}
        fill="none"
        stroke="var(--line)"
        stroke-width="1"
      />
      <polygon
        points={data.map((d, i) => {
          const p = polarToCartesian(angleStep * i, radius * d.score / 100);
          return `${p.x},${p.y}`;
        }).join(' ')}
        fill="var(--accent)"
        fill-opacity="0.2"
        stroke="var(--accent)"
        stroke-width="2"
      />
    {/if}

    {#each data as d, i}
      {@const angle = angleStep * i - Math.PI / 2}
      {@const labelPos = polarToCartesian(angleStep * i, radius + 22)}
      {@const anchor = Math.cos(angle) > 0.25 ? 'start' : Math.cos(angle) < -0.25 ? 'end' : 'middle'}
      <text
        x={labelPos.x}
        y={labelPos.y}
        class="radar-label"
        text-anchor={anchor}
        aria-label={d.isHybrid ? `${domainLabels[d.domain] ?? d.domain} ${d.score}（結合問卷與測驗兩種證據之平均）` : undefined}
      >
        {domainLabels[d.domain] ?? d.domain}<tspan x={labelPos.x} dy="1.25em" class="radar-score">{d.score}</tspan>{#if d.isHybrid}<tspan dx="3" class="radar-hybrid-icon">⚖</tspan>{/if}
      </text>
    {/each}
  </svg>
</div>

<style>
.radar-wrap { display: flex; flex-direction: column; align-items: center; }
.radar-header { text-align: center; }
.radar-header h3 { font-size: var(--text-lg); margin: 0 0 var(--space-1) 0; }
.radar-header .legend {
  font-size: var(--text-sm);
  color: var(--text);
  opacity: 0.7;
  margin: 0 0 var(--space-4) 0;
}
.radar-chart { display: block; }
.radar-label { font-size: var(--text-sm); fill: var(--text); }
.radar-score { font-size: var(--text-sm); fill: var(--accent); font-weight: var(--font-bold); }
.radar-hybrid-icon {
  font-family: var(--font-sans, system-ui), "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif;
  fill: var(--text);
  font-size: var(--text-sm);
}
</style>
