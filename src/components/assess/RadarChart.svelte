<script lang="ts">
  interface Props {
    data: Array<{ domain: string; score: number; hasAnomaly: boolean }>;
    size?: number;
  }

  let { data, size = 300 }: Props = $props();

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
  const radius = $derived(size / 2 - 40);
  const angleStep = $derived(data.length > 0 ? (2 * Math.PI) / data.length : 0);

  function polarToCartesian(angle: number, r: number): { x: number; y: number } {
    return {
      x: center + r * Math.cos(angle - Math.PI / 2),
      y: center + r * Math.sin(angle - Math.PI / 2),
    };
  }

  const gridLevels = [20, 40, 60, 80, 100];

  const dataPoints = $derived(
    data.map((d, i) => {
      const angle = i * angleStep;
      const r = (d.score / 100) * radius;
      return polarToCartesian(angle, r);
    })
  );

  const dataPath = $derived(
    dataPoints.length > 0
      ? dataPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z'
      : ''
  );
</script>

<svg viewBox="0 0 {size} {size}" width={size} height={size} class="radar-chart" role="img" aria-label="發展面向雷達圖">
  <!-- Grid circles -->
  {#each gridLevels as level}
    <circle
      cx={center}
      cy={center}
      r={radius * level / 100}
      fill="none"
      stroke="var(--line)"
      stroke-width="1"
      opacity="0.5"
    />
  {/each}

  <!-- Axis lines + labels -->
  {#each data as d, i}
    {@const angle = i * angleStep}
    {@const end = polarToCartesian(angle, radius)}
    {@const labelPos = polarToCartesian(angle, radius + 25)}
    <line x1={center} y1={center} x2={end.x} y2={end.y} stroke="var(--line)" stroke-width="1" opacity="0.3" />
    <text x={labelPos.x} y={labelPos.y} text-anchor="middle" dominant-baseline="middle" font-size="12" fill="color-mix(in srgb, var(--text), var(--bg) 30%)">
      {domainLabels[d.domain] ?? d.domain}
    </text>
  {/each}

  <!-- Data polygon -->
  {#if dataPath}
    <path d={dataPath} fill="var(--accent)" fill-opacity="0.2" stroke="var(--accent)" stroke-width="2" />
  {/if}

  <!-- Data points -->
  {#each dataPoints as point, i}
    <circle
      cx={point.x}
      cy={point.y}
      r="5"
      fill={data[i].hasAnomaly ? 'var(--danger)' : 'var(--accent)'}
      stroke="#fff"
      stroke-width="2"
    />
  {/each}
</svg>

<style>
  .radar-chart {
    display: block;
    margin: 0 auto;
    max-width: 100%;
    height: auto;
  }
</style>
